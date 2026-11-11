import { Actions, Events, RunCountSchema, TableStates } from "@nostakes/engine";
import { CommandIdSchema } from "@nostakes/protocol";
import type { PlayerId, RoomPass } from "@nostakes/protocol";
import {
  Actors,
  ChipAmountSchema,
  RoomCommands,
  RoomEvents,
  RoomStates,
  RoomViews,
  decide,
  replay,
} from "@nostakes/room";
import type { RoomEvent, RoomView } from "@nostakes/room";
import { Duration, Effect, Option, Result } from "effect";

import { MemberCommandSchema } from "../../src/poker-room.js";
import type { MemberCommand } from "../../src/poker-room.js";
import type { NightControl } from "./bot.js";
import { ledgerFromLog } from "./halted-standings.js";
import {
  closingOf,
  comeBackAndRead,
  hello,
  rangesOf,
  removalProblems,
} from "./intruder.js";
import type { RemovalRecord } from "./intruder.js";
import { joinPokerRoom } from "./poker-http.js";
import { pokerCodec } from "./poker-socket.js";
import type { PokerSocket } from "./poker-socket.js";

const Commands = MemberCommandSchema.cases;

const { guards } = pokerCodec.server;

export const REGULAR_NAME = "regular";

const PLAY_EVERY_MS = 40;

type OpenView = Extract<RoomView, { readonly _tag: "Open" }>;

export interface RegularRecord extends RemovalRecord {
  readonly handsDealt: number;
}

export const joinRegular = (base: string, code: RoomPass["code"]) =>
  joinPokerRoom(base, code, { avatar: "regular", name: REGULAR_NAME });

const latestOpenView = (socket: PokerSocket): Option.Option<OpenView> =>
  Option.fromUndefinedOr(
    socket.arrivals.findLast(
      ({ message }) => guards.Welcome(message) || guards.Events(message)
    )
  ).pipe(
    Option.flatMap(({ message }) =>
      guards.Welcome(message) || guards.Events(message)
        ? Option.some(message.view)
        : Option.none()
    ),
    Option.filter(RoomViews.$is("Open"))
  );

const seatOf = (view: OpenView, player: PlayerId) =>
  Option.fromUndefinedOr(
    view.seats.find(({ occupant }) =>
      Option.exists(occupant, (seated) => seated.player === player)
    )
  );

const actionFor = ({
  call,
  canCheck,
}: {
  readonly call: Option.Option<unknown>;
  readonly canCheck: boolean;
}) => {
  if (canCheck) {
    return Actions.Check();
  }

  return Option.isSome(call) ? Actions.Call() : Actions.Fold();
};

const nextMove = (
  view: OpenView,
  player: PlayerId,
  firstSeat: number
): Option.Option<MemberCommand> => {
  const mine = seatOf(view, player);

  if (Option.isSome(view.legal)) {
    return Option.some(
      Commands.Act.make({ action: actionFor(view.legal.value) })
    );
  }

  if (Option.isSome(view.showdown)) {
    return Option.some(
      view.showdown.value.canTable
        ? Commands.TableHand.make({})
        : Commands.MuckHand.make({})
    );
  }

  const choosing = view.hand.pipe(
    Option.flatMap(({ choosingRuns }) => choosingRuns),
    Option.exists(({ seats }) =>
      Option.exists(mine, ({ seat }) => seats.includes(seat))
    )
  );

  if (choosing) {
    return Option.some(
      Commands.ChooseRuns.make({ runs: RunCountSchema.make(1) })
    );
  }

  const occupant = mine.pipe(Option.flatMap(({ occupant: seated }) => seated));

  if (Option.isSome(occupant)) {
    if (occupant.value.sittingOut) {
      return Option.some(Commands.SitIn.make({}));
    }

    const asked = [...view.requests.chips, ...view.queued.chips].some(
      (request) => request.player === player
    );

    return occupant.value.stack === 0 && !asked && Option.isNone(view.hand)
      ? Option.some(
          Commands.RequestChips.make({ amount: view.settings.buyIn.min })
        )
      : Option.none();
  }

  const asked = view.requests.seats.some(
    (request) => request.player === player
  );

  const free = view.seats.find(
    ({ occupant: sitting, seat }) =>
      seat >= firstSeat &&
      seat < view.settings.seats &&
      Option.isNone(sitting) &&
      !view.requests.seats.some((request) => request.seat === seat)
  );

  return asked || free === undefined
    ? Option.none()
    : Option.some(
        Commands.RequestSeat.make({
          buyIn: ChipAmountSchema.make(view.settings.buyIn.min),
          seat: free.seat,
        })
      );
};

const dealtInto = (view: OpenView, player: PlayerId) =>
  view.hand.pipe(
    Option.exists(({ players }) =>
      players.some((seated) => seated.player === player)
    )
  );

export const playRegular = (
  base: string,
  pass: RoomPass,
  control: NightControl,
  removeAtHand: number,
  firstSeat: number,
  note: (line: string) => void
) =>
  Effect.gen(function* regularNight() {
    const sockets: PokerSocket[] = [];
    let attempt = 0;

    const greet = () =>
      hello(base, pass, `${REGULAR_NAME} #${(attempt += 1)}`).pipe(
        Effect.tap(({ socket }) =>
          Effect.sync(() => {
            sockets.push(socket);
          })
        )
      );

    let live = (yield* greet()).socket;
    let removedVia = Option.none<"Live" | "Hello">();
    let decided = "";
    let sent = 0;
    let handsDealt = 0;
    let lastHand = 0;

    control.regulars.set(pass.player, removeAtHand);
    note(`a regular sat down as ${pass.player}`);

    while (Option.isNone(removedVia) && !control.stop) {
      if (Option.contains(closingOf(live), "Removed")) {
        removedVia = Option.some("Live");

        continue;
      }

      if (Option.isSome(live.closed())) {
        const again = yield* greet();

        live = again.socket;
        removedVia =
          again.greeting === "Removed" ? Option.some("Hello") : Option.none();

        continue;
      }

      for (const view of Option.toArray(latestOpenView(live))) {
        const hand = view.hand.pipe(
          Option.map(({ handNumber }) => handNumber),
          Option.getOrElse(() => 0)
        );

        if (hand > lastHand && dealtInto(view, pass.player)) {
          handsDealt += 1;
          lastHand = hand;
        }

        for (const command of Option.toArray(
          nextMove(view, pass.player, firstSeat)
        )) {
          const key = JSON.stringify([
            command._tag,
            hand,
            view.hand.pipe(Option.map(({ street }) => street)),
            view.legal,
            view.showdown,
            seatOf(view, pass.player).pipe(
              Option.map(({ occupant }) => occupant)
            ),
            view.requests,
          ]);

          if (key !== decided) {
            decided = key;
            sent += 1;
            yield* live.send(
              pokerCodec.client.cases.Command.make({
                command,
                id: CommandIdSchema.make(`regular-${sent}`),
              })
            );
          }
        }
      }

      yield* live.pingIfQuiet;
      yield* Effect.sleep(Duration.millis(PLAY_EVERY_MS));
    }

    if (Option.isNone(removedVia)) {
      for (const socket of sockets) {
        yield* socket.disconnect;
      }

      return {
        cameBack: "not removed",
        handsDealt,
        player: pass.player,
        ranges: rangesOf(sockets),
        removedVia,
        standings: Option.none(),
      };
    }

    note(
      `the regular was removed (${removedVia.value}) after ${handsDealt} hands`
    );

    return {
      ...(yield* comeBackAndRead(base, pass, sockets, REGULAR_NAME)),
      handsDealt,
      player: pass.player,
      ranges: rangesOf(sockets),
      removedVia,
    };
  });

const handEndsAfter = (events: readonly RoomEvent[], from: number) =>
  events.findIndex(
    (event, index) =>
      index > from &&
      RoomEvents.$is("Table")(event) &&
      Events.$is("HandEnded")(event.event)
  );

const midHandProblems = (
  record: RegularRecord,
  events: readonly RoomEvent[],
  at: number
): readonly string[] => {
  const queued = events[at - 1];

  if (
    queued === undefined ||
    !RoomEvents.$is("LeaveQueued")(queued) ||
    queued.player !== record.player
  ) {
    return [];
  }

  const [opened, ...rest] = events.slice(0, at - 1);

  if (opened === undefined || !RoomEvents.$is("RoomOpened")(opened)) {
    return ["the stored log does not open with RoomOpened"];
  }

  const before = replay([opened, ...rest]);

  const committed =
    RoomStates.$is("Open")(before) && TableStates.$is("InHand")(before.table)
      ? (before.table.hand.players.find(
          ({ player }) => player === record.player
        )?.committedTotal ?? 0)
      : 0;

  const asLeft = decide(
    before,
    RoomCommands.LeaveRoom({
      at: queued.at,
      by: Actors.Member({ player: record.player }),
    })
  );

  const expected = Result.isSuccess(asLeft)
    ? asLeft.success.map((event) =>
        RoomEvents.$is("MemberLeft")(event)
          ? RoomEvents.MemberRemoved({ at: event.at, player: event.player })
          : event
      )
    : [];

  const removalBatch = events.slice(at - 1, at - 1 + expected.length);
  const ended = handEndsAfter(events, at);

  const nextHand = events.findIndex(
    (event, index) =>
      index > ended &&
      RoomEvents.$is("Table")(event) &&
      Events.$is("HandStarted")(event.event)
  );

  const stoodUp = events.findIndex(
    (event, index) =>
      index > ended &&
      (nextHand === -1 || index < nextHand) &&
      ((RoomEvents.$is("CashedOut")(event) && event.player === record.player) ||
        (RoomEvents.$is("Table")(event) &&
          Events.$is("PlayerStood")(event.event) &&
          event.event.player === record.player))
  );

  const row = ledgerFromLog(events).find(
    ({ player }) => player === record.player
  );

  const settled = events.flatMap((event) =>
    RoomEvents.$is("RoomClosed")(event)
      ? event.settlement.balances.filter(
          ({ player }) => player === record.player
        )
      : []
  );

  return [
    ...(committed > 0
      ? []
      : ["the regular had no chips in the pot when the host removed them"]),
    ...(removalBatch.map((event) => pokerCodec.encodeEvent(event)).join(",") ===
      expected.map((event) => pokerCodec.encodeEvent(event)).join(",") &&
    expected.length > 0
      ? []
      : [
          `the batch that removed the regular was ${removalBatch.map(({ _tag }) => _tag).join(",")}, not what their own leave would have been: ${expected.map(({ _tag }) => _tag).join(",")}`,
        ]),
    ...(ended !== -1 && stoodUp !== -1
      ? []
      : [
          "the regular's seat did not stand up and cash out when the hand they were removed from ended",
        ]),
    ...settled.flatMap((line) =>
      row === undefined ||
      line.boughtIn !== row.boughtIn ||
      line.cashedOut !== row.cashedOut
        ? [
            `the closed room settled the regular at ${JSON.stringify(line)}, not their line ${JSON.stringify(row)} in the log`,
          ]
        : []
    ),
  ];
};

export const regularProblems = (
  record: RegularRecord,
  events: readonly RoomEvent[]
): readonly string[] => {
  const at = events.findIndex(
    (event) =>
      RoomEvents.$is("MemberRemoved")(event) && event.player === record.player
  );

  return [
    ...removalProblems(record, events, REGULAR_NAME),
    ...(at === -1 ? [] : midHandProblems(record, events, at)),
  ];
};
