import {
  CloseReasonSchema,
  CommandIdSchema,
  StandingsRequestSchema,
  revokedStandings,
} from "@nostakes/protocol";
import type { PlayerId, RoomPass } from "@nostakes/protocol";
import { RemovedViewSchema, RoomEvents, RoomViews } from "@nostakes/room";
import type { RoomEvent } from "@nostakes/room";
import { Duration, Effect, Option, Schema } from "effect";

import { MemberCommandSchema } from "../../src/poker-room.js";
import type { NightControl } from "./bot.js";
import { ledgerFromLog } from "./halted-standings.js";
import { joinPokerRoom, postJson } from "./poker-http.js";
import { awaitArrival, openSocket, pokerCodec } from "./poker-socket.js";
import type { PokerSocket } from "./poker-socket.js";

const Commands = MemberCommandSchema.cases;

const { guards } = pokerCodec.server;

export const INTRUDER_NAME = "stranger";

export const KNOCKER_NAME = "knocker";

const REMOVAL_WAIT_MS = 90_000;

export const DOOR_WAIT_MS = 30_000;

const FINISHING_WAIT_MS = 30_000;

export interface IntruderRecord {
  readonly knocked: string;
  readonly player: PlayerId;
  readonly removedVia: Option.Option<"Live" | "Hello">;
  readonly ranges: readonly { readonly from: number; readonly to: number }[];
  readonly cameBack: string;
  readonly standings: Option.Option<{
    readonly status: number;
    readonly body: Schema.Json;
  }>;
}

type Greeting = "Welcomed" | "Removed" | "Other";

const greeted = (socket: PokerSocket) =>
  socket.arrivals.some(({ message }) => guards.Welcome(message));

export const closingOf = (socket: PokerSocket) =>
  Option.fromUndefinedOr(
    socket.arrivals.find(({ message }) => guards.Closing(message))
  ).pipe(
    Option.flatMap(({ message }) =>
      guards.Closing(message) ? Option.some(message.reason) : Option.none()
    )
  );

export const hello = (base: string, pass: RoomPass, label: string) =>
  Effect.gen(function* openAndGreet() {
    const socket = yield* openSocket(base, pass.code, label);

    yield* socket.send(
      pokerCodec.client.cases.Hello.make({
        after: Option.none(),
        token: pass.token,
      })
    );

    yield* awaitArrival(
      socket,
      "a welcome or a closing",
      (message): message is typeof message =>
        guards.Welcome(message) || guards.Closing(message)
    ).pipe(Effect.ignore);

    const greeting: Greeting = greeted(socket)
      ? "Welcomed"
      : Option.match(closingOf(socket), {
          onNone: () => "Other",
          onSome: (reason) => (reason === "Removed" ? "Removed" : "Other"),
        });

    return { greeting, socket };
  });

const freeSeat = (socket: PokerSocket) =>
  Option.fromUndefinedOr(
    socket.arrivals.find(({ message }) => guards.Welcome(message))
  ).pipe(
    Option.flatMap(({ message }) =>
      guards.Welcome(message) && RoomViews.$is("Open")(message.view)
        ? Option.some(message.view)
        : Option.none()
    ),
    Option.flatMap((view) =>
      Option.fromUndefinedOr(
        view.seats.find(
          ({ occupant, seat }) =>
            Option.isNone(occupant) &&
            seat < view.settings.seats &&
            !view.requests.seats.some((request) => request.seat === seat)
        )
      ).pipe(
        Option.map(({ seat }) => ({ buyIn: view.settings.buyIn.min, seat }))
      )
    )
  );

export const rangesOf = (sockets: readonly PokerSocket[]) =>
  sockets.flatMap(({ arrivals }) =>
    arrivals.flatMap(({ message }) =>
      guards.Events(message) ? [{ from: message.from, to: message.to }] : []
    )
  );

const readStandings = (base: string, pass: RoomPass) =>
  postJson(
    new URL(`/rooms/${pass.code}/standings`, base),
    Schema.encodeSync(StandingsRequestSchema)({ token: pass.token })
  ).pipe(
    Effect.flatMap((response) =>
      response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Json)),
        Effect.map((body) => ({ body, status: response.status }))
      )
    ),
    Effect.orDie
  );

const RemovedBodySchema = revokedStandings(
  Schema.toCodecJson(RemovedViewSchema)
);

const decodeRemoved = Schema.decodeUnknownOption(RemovedBodySchema);

const stillFinishing = (standings: { readonly body: Schema.Json }) =>
  Option.exists(
    decodeRemoved(standings.body),
    ({ removed }) => removed.finishing
  );

const COMEBACK_TRIES = 6;

const COMEBACK_GAP_MS = 1000;

const decodeCloseReason = Schema.decodeUnknownOption(CloseReasonSchema);

const serverReason = (socket: PokerSocket) =>
  closingOf(socket).pipe(
    Option.orElse(() =>
      socket
        .closed()
        .pipe(Option.flatMap(({ reason }) => decodeCloseReason(reason)))
    )
  );

const answerOf = (socket: PokerSocket): Option.Option<string> =>
  greeted(socket) ? Option.some("Welcomed") : serverReason(socket);

const attemptOf = (socket: PokerSocket) => {
  if (greeted(socket)) {
    return "Welcomed";
  }

  return Option.match(closingOf(socket), {
    onNone: () =>
      Option.match(socket.closed(), {
        onNone: () => "no answer within 10 s",
        onSome: ({ code, reason }) => `closed ${code} ${reason}`,
      }),
    onSome: (reason) => `Closing ${reason}`,
  });
};

const helloThroughRestarts = (base: string, pass: RoomPass, label: string) =>
  Effect.gen(function* comeBackThroughRestarts() {
    const attempts: string[] = [];
    const sockets: PokerSocket[] = [];
    let answer = Option.none<string>();

    for (
      let attempt = 1;
      attempt <= COMEBACK_TRIES && Option.isNone(answer);
      attempt += 1
    ) {
      const tried = yield* hello(base, pass, `${label} #${attempt}`).pipe(
        Effect.option
      );

      for (const { socket } of Option.toArray(tried)) {
        sockets.push(socket);
        attempts.push(attemptOf(socket));
        answer = answerOf(socket);
      }

      if (Option.isNone(tried)) {
        attempts.push("could not open");
      }

      if (Option.isNone(answer) && attempt < COMEBACK_TRIES) {
        yield* Effect.sleep(Duration.millis(COMEBACK_GAP_MS));
      }
    }

    return {
      cameBack: Option.match(answer, {
        onNone: () => `no answer (${attempts.join("; ")})`,
        onSome: (reason) =>
          reason === "Removed" ? reason : `${reason} (${attempts.join("; ")})`,
      }),
      sockets,
    };
  });

export const comeBackAndRead = (
  base: string,
  pass: RoomPass,
  sockets: readonly PokerSocket[],
  label: string
) =>
  Effect.gen(function* comeBack() {
    const back = yield* helloThroughRestarts(base, pass, `${label} comes back`);

    let standings = yield* readStandings(base, pass);
    const asked = performance.now();

    while (
      stillFinishing(standings) &&
      performance.now() - asked < FINISHING_WAIT_MS
    ) {
      yield* Effect.sleep(Duration.millis(250));
      standings = yield* readStandings(base, pass);
    }

    for (const socket of [...sockets, ...back.sockets]) {
      yield* socket.disconnect;
    }

    return {
      cameBack: back.cameBack,
      standings: Option.some(standings),
    };
  });

export const intrude = (
  base: string,
  pass: RoomPass,
  control: NightControl,
  removeAtHand: () => number,
  note: (line: string) => void,
  sits: boolean
) =>
  Effect.gen(function* intruderNight() {
    const sockets: PokerSocket[] = [];
    let attempt = 0;

    const greet = () =>
      hello(base, pass, `${INTRUDER_NAME} #${(attempt += 1)}`).pipe(
        Effect.tap(({ socket }) =>
          Effect.sync(() => {
            sockets.push(socket);
          })
        )
      );

    const first = yield* greet();

    for (const seat of Option.toArray(
      freeSeat(first.socket).pipe(Option.filter(() => sits))
    )) {
      yield* first.socket.send(
        pokerCodec.client.cases.Command.make({
          command: Commands.RequestSeat.make(seat),
          id: CommandIdSchema.make("stranger-seat"),
        })
      );
    }

    control.intruders.set(pass.player, removeAtHand());
    note(`a stranger joined as ${pass.player} and asked for a seat`);

    let removedVia = Option.none<"Live" | "Hello">();
    let live = first.socket;
    const since = performance.now();

    while (
      Option.isNone(removedVia) &&
      !control.stop &&
      performance.now() - since < REMOVAL_WAIT_MS
    ) {
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

      yield* Effect.sleep(Duration.millis(100));
    }

    if (Option.isNone(removedVia)) {
      return {
        cameBack: "not removed",
        player: pass.player,
        ranges: rangesOf(sockets),
        removedVia,
        standings: Option.none(),
      };
    }

    note(
      `the stranger was removed (${removedVia.value}) and tries to come back`
    );

    return {
      ...(yield* comeBackAndRead(base, pass, sockets, INTRUDER_NAME)),
      player: pass.player,
      ranges: rangesOf(sockets),
      removedVia,
    };
  });

export const knockAt = (base: string, code: RoomPass["code"]) =>
  postJson(new URL(`/rooms/${code}/members`, base), {
    avatar: "stranger",
    name: KNOCKER_NAME,
  }).pipe(
    Effect.flatMap((response) =>
      response.json.pipe(
        Effect.map((body) => `${response.status} ${JSON.stringify(body)}`)
      )
    ),
    Effect.orDie
  );

export const lockedOut = (code: string) =>
  `409 {"refusal":"JoinRefused","rejection":{"_tag":"RoomLocked","code":"${code}"}}`;

export const joinIntruder = (base: string, code: RoomPass["code"]) =>
  joinPokerRoom(base, code, { avatar: "stranger", name: INTRUDER_NAME });

const removedAt = (events: readonly RoomEvent[], player: PlayerId) =>
  events.findIndex(
    (event) => RoomEvents.$is("MemberRemoved")(event) && event.player === player
  );

const FORBIDDEN_AFTER_REMOVAL = new Set<RoomEvent["_tag"]>([
  "BoughtIn",
  "ChipsRequested",
  "LeaveQueued",
  "MemberJoined",
  "PostingChosen",
  "ProfileChanged",
  "SeatRequested",
  "StraddleDeclared",
]);

const doorProblems = (
  record: IntruderRecord,
  events: readonly RoomEvent[]
): readonly string[] => {
  const [opened] = events;

  const code =
    opened !== undefined && RoomEvents.$is("RoomOpened")(opened)
      ? opened.code
      : "";

  return record.knocked === lockedOut(code)
    ? []
    : [
        `a stranger knocked while the host had the room locked and got ${record.knocked}, not ${lockedOut(code)}`,
      ];
};

export type RemovalRecord = Omit<IntruderRecord, "knocked">;

export const removalProblems = (
  record: RemovalRecord,
  events: readonly RoomEvent[],
  who = "stranger"
): readonly string[] => {
  const at = removedAt(events, record.player);

  if (at === -1) {
    return Option.isSome(record.removedVia)
      ? [
          `the ${who}'s socket was closed as removed, but the log never removed ${record.player}`,
        ]
      : [];
  }

  const seq = at + 1;

  const row = ledgerFromLog(events).find(
    ({ player }) => player === record.player
  ) ?? { boughtIn: 0, cashedOut: 0, net: 0, player: record.player };

  const read = record.standings.pipe(
    Option.flatMap(({ body, status }) =>
      status === 200 ? decodeRemoved(body) : Option.none()
    ),
    Option.map(({ removed }) => ({
      boughtIn: removed.balance.boughtIn,
      cashedOut: removed.balance.cashedOut,
      net: removed.balance.net,
      player: removed.player,
    }))
  );

  const later = events
    .slice(at + 1)
    .filter(
      (event) =>
        "player" in event &&
        event.player === record.player &&
        FORBIDDEN_AFTER_REMOVAL.has(event._tag)
    );

  return [
    ...(Option.isSome(record.removedVia)
      ? []
      : [
          `the log removed the ${who} at ${seq}, but no socket of theirs was closed as Removed`,
        ]),
    ...(record.cameBack === "Removed"
      ? []
      : [
          `the removed ${who}'s pass came back and got ${record.cameBack}, not Removed`,
        ]),
    ...record.ranges
      .filter(({ to }) => to >= seq)
      .map(
        ({ from, to }) =>
          `the removed ${who} received events ${from}..${to}, past the batch at ${seq} that removed them`
      ),
    ...(JSON.stringify(Option.getOrUndefined(read)) === JSON.stringify(row)
      ? []
      : [
          `the removed ${who} read ${JSON.stringify(Option.getOrUndefined(record.standings))} as their result, not their line ${JSON.stringify(row)} from the log`,
        ]),
    ...later.map(
      (event) => `the removed ${who} caused ${event._tag} after removal`
    ),
  ];
};

export const intruderProblems = (
  record: IntruderRecord,
  events: readonly RoomEvent[]
): readonly string[] => [
  ...doorProblems(record, events),
  ...removalProblems(record, events),
];
