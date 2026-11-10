import { describe, expect, it } from "@effect/vitest";
import { ChipsSchema } from "@nostakes/engine";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import type { PlayerId } from "@nostakes/protocol";
import {
  HandViewSchema,
  REACTIONS,
  RoomSignalSchema,
  RoomViewSchema,
} from "@nostakes/room";
import type { RoomSignal } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { Messages } from "../src/features/message.js";
import type { Message } from "../src/features/message.js";
import type { Model } from "../src/features/model.js";
import { roomOf } from "../src/features/room.js";
import {
  PEEK_LEASE_MS,
  PEEK_REFRESH_MS,
  REACTION_SHOWN_MS,
} from "../src/features/signals.js";
import { tableSnapshot } from "../src/features/table/from-room.js";
import { TableIntents } from "../src/features/table/snapshot.js";
import { init, update } from "../src/features/update.js";

const CODE = RoomCodeSchema.make("ABC234");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const STRANGER = PlayerIdSchema.make("stranger-0000000");

type OpenView = typeof RoomViewSchema.cases.Open.Type;

const Signals = RoomSignalSchema.cases;

const wireId = (seat: number) =>
  PlayerIdSchema.make(`seat-${seat}`.padEnd(16, "0"));

const views = Arbitrary.schema(RoomViewSchema.cases.Open);

const hands = Arbitrary.schema(HandViewSchema);

const STATUSES = ["Active", "AllIn", "Folded"] as const;

const dealtIn = (view: OpenView): OpenView => ({
  ...view,
  hand: view.hand.pipe(
    Option.map((hand) => ({
      ...hand,
      players: view.seats.flatMap(({ occupant, seat }) =>
        Option.toArray(occupant).map(({ player }) => ({
          committedThisStreet: ChipsSchema.make(0),
          committedTotal: ChipsSchema.make(0),
          mucked: seat % 4 === 3,
          player,
          seat,
          shown: [],
          status: STATUSES[seat % STATUSES.length] ?? "Active",
        }))
      ),
    }))
  ),
});

const withWireIds = (view: OpenView): OpenView => ({
  ...view,
  seats: view.seats
    .filter(
      ({ seat }, index) =>
        view.seats.findIndex((other) => other.seat === seat) === index
    )
    .map(({ occupant, seat }) => ({
      occupant: occupant.pipe(
        Option.map((seated) => ({ ...seated, player: wireId(seat) }))
      ),
      seat,
    })),
});

const HEARD_AT = 1_000_000;

const start = init({
  invite: Option.none(),
  learned: [],
  profile: { avatar: "", name: "Ana" },
  reloadedFor: Option.none(),
  rooms: [],
  saved: Option.some({ code: CODE, player: PLAYER }),
  sound: false,
  systemTheme: "Light",
  theme: Option.none(),
}).model;

const run = (model: Model, messages: readonly Message[]) => {
  let current = model;

  for (const message of messages) {
    current = update(current, message).model;
  }

  return current;
};

const shownWith = (view: OpenView, live: boolean) =>
  run(start, [
    Messages.GotUpdate({ events: [], receivedAt: HEARD_AT, seq: 1, view }),
    Messages.GotLink({
      link: {
        newBuild: Option.none(),
        phase: live ? "Live" : "Waiting",
        presence: [],
        receivedAt: HEARD_AT,
        refusal: Option.none(),
        retryDelayMs: Option.none(),
      },
    }),
  ]);

const snapshotOf = (model: Model, view: OpenView) =>
  Option.map(roomOf(model), (room) => tableSnapshot(room, view, [], []));

const seatedIn = (view: OpenView) =>
  view.seats.flatMap(({ occupant, seat }) =>
    Option.toArray(occupant).map(({ player }) => ({ player, seat }))
  );

const heardAt = (from: PlayerId, signal: RoomSignal, at: number) =>
  Messages.HeardSignal({ from, receivedAt: at, signal });

const looking = (looks: boolean) => Signals.Peeking.make({ looking: looks });

const tick = (now: number) => Messages.Ticked({ now });

const peekingSeats = (model: Model, view: OpenView) =>
  Option.match(snapshotOf(model, view), {
    onNone: () => [],
    onSome: ({ seats }) =>
      seats.flatMap(({ peeking, seat }) => (peeking ? [seat] : [])),
  });

describe("a peek heard from the table", () => {
  it.prop(
    "turns a face down exactly while the room shows peeks, the seat still holds cards, and the latest peek from its player is under the lease old, so a lost stop expires and a refresh keeps it",
    { hand: hands, view: views },
    ({ hand, view: table }) => {
      const generated = { ...table, hand: Option.some(hand) };

      for (const shownToAll of [true, false]) {
        const dealt = dealtIn(withWireIds(generated));

        const view = {
          ...dealt,
          settings: { ...dealt.settings, peeking: shownToAll },
        };

        const seated = seatedIn(view).filter(
          ({ seat }) => seat < view.settings.seats
        );

        const quiet = shownWith(view, true);

        const holding = Option.match(snapshotOf(quiet, view), {
          onNone: (): readonly number[] => [],
          onSome: ({ seats }) =>
            seats.flatMap(({ cardsHeld, seat, status }) =>
              view.settings.peeking &&
              (status === "In" || status === "AllIn") &&
              cardsHeld > 0
                ? [seat]
                : []
            ),
        });

        for (const { player, seat } of seated) {
          const expected = holding.includes(seat) ? [seat] : [];
          const peeked = run(quiet, [heardAt(player, looking(true), HEARD_AT)]);

          expect(peekingSeats(quiet, view)).toEqual([]);
          expect(peekingSeats(peeked, view)).toEqual(expected);
          expect(
            peekingSeats(
              run(peeked, [tick(HEARD_AT + PEEK_LEASE_MS - 1)]),
              view
            )
          ).toEqual(expected);
          expect(
            peekingSeats(run(peeked, [tick(HEARD_AT + PEEK_LEASE_MS)]), view)
          ).toEqual([]);
          expect(
            peekingSeats(
              run(peeked, [heardAt(player, looking(false), HEARD_AT + 10)]),
              view
            )
          ).toEqual([]);
          expect(
            peekingSeats(
              run(peeked, [
                heardAt(player, looking(true), HEARD_AT + PEEK_REFRESH_MS),
                tick(HEARD_AT + PEEK_LEASE_MS),
              ]),
              view
            )
          ).toEqual(expected);
        }
      }
    },
    { arbitrary: { runs: 100 } }
  );
});

describe("a reaction", () => {
  it.prop(
    "rises from the sender's seat, or from the middle for someone not seated, once, with a fresh id, and is gone once it has shown",
    {
      pick: Schema.Int.check(Schema.isBetween({ maximum: 4, minimum: 0 })),
      view: views,
    },
    ({ pick, view: generated }) => {
      const view = withWireIds(generated);

      const reaction = REACTIONS[pick] ?? "Clap";
      const quiet = shownWith(view, true);
      const senders = [...seatedIn(view), { player: STRANGER, seat: null }];

      for (const { player, seat } of senders) {
        const once = run(quiet, [
          heardAt(player, Signals.Reaction.make({ reaction }), HEARD_AT),
        ]);

        const twice = run(once, [
          heardAt(player, Signals.Reaction.make({ reaction }), HEARD_AT + 1),
        ]);

        const shown = (model: Model) =>
          Option.match(snapshotOf(model, view), {
            onNone: () => [],
            onSome: ({ reactions }) => reactions,
          });

        const [first] = shown(once);
        const [, second] = shown(twice);

        expect(
          shown(once).map(({ reaction: sent, seat: from }) => [sent, from])
        ).toEqual([[reaction, seat]]);
        expect((second?.id ?? 0) > (first?.id ?? 0)).toBe(true);
        expect(shown(run(once, [tick(HEARD_AT + REACTION_SHOWN_MS)]))).toEqual(
          []
        );
      }
    },
    { arbitrary: { runs: 40 } }
  );
});

const signalsSent = (model: Model, message: Message) =>
  (update(model, message).commands ?? []).flatMap((command) =>
    command.name === "SignalRoom"
      ? [
          Schema.decodeUnknownSync(Schema.Struct({ signal: RoomSignalSchema }))(
            command.args
          ).signal,
        ]
      : []
  );

describe("the table's own peeks and reactions", () => {
  it.prop(
    "a peek goes out only while live and while the room shows peeks, and a reaction whenever live",
    { view: views },
    ({ view: generated }) => {
      const view = withWireIds(generated);

      const peek = Messages.GotTableIntent({
        intent: TableIntents.Peek.make({ looking: true }),
      });

      const clap = Messages.GotTableIntent({
        intent: TableIntents.React.make({ reaction: "Clap" }),
      });

      for (const live of [true, false]) {
        for (const shown of [true, false]) {
          const seen = {
            ...view,
            settings: { ...view.settings, peeking: shown },
          };

          const model = shownWith(seen, live);

          expect(signalsSent(model, peek)).toEqual(
            live && shown ? [looking(true)] : []
          );
          expect(signalsSent(model, clap)).toEqual(
            live ? [Signals.Reaction.make({ reaction: "Clap" })] : []
          );
        }
      }
    },
    { arbitrary: { runs: 20 } }
  );

  it.prop(
    "a reaction that left the device rises from your own seat, and one that never left does not",
    { view: views },
    ({ view: generated }) => {
      const view = withWireIds(generated);

      const model = shownWith(view, true);
      const wow = Signals.Reaction.make({ reaction: "Wow" });

      const reactionsAfter = (sent: boolean) =>
        Option.match(
          snapshotOf(
            run(model, [
              Messages.SentSignal({ at: HEARD_AT, sent, signal: wow }),
            ]),
            view
          ),
          {
            onNone: () => [],
            onSome: ({ reactions }) =>
              reactions.map(({ reaction, seat }) => [reaction, seat]),
          }
        );

      const mine =
        seatedIn(view).find(({ player }) => player === PLAYER)?.seat ?? null;

      expect(reactionsAfter(true)).toEqual([["Wow", mine]]);
      expect(reactionsAfter(false)).toEqual([]);
    },
    { arbitrary: { runs: 20 } }
  );
});
