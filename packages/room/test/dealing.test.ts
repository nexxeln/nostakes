import { describe, expect, it } from "@effect/vitest";
import { DeckSchema, Events, TableStates } from "@nostakes/engine";
import { Option, Result, Schema } from "effect";

import {
  DealNotDue,
  GameAlready,
  NotSeated,
  NotTheHost,
  RoomCommands,
  RoomEvents,
  ServerOnly,
  ShuffleRanOut,
  deckFromBytes,
} from "../src/index.js";
import type { RoomState } from "../src/index.js";
import {
  ann,
  as,
  bob,
  bytesFrom,
  cat,
  dan,
  dealAt,
  join,
  ms,
  openOf,
  openedBy,
  rejection,
  run,
  runAll,
  seat,
  settings,
  sit,
} from "./fixtures.js";

const start = (at: number) =>
  RoomCommands.StartGame({ at: ms(at), by: as(ann) });

const seated = runAll(openedBy(ann, { ...settings, betweenHandsSeconds: 5 }), [
  join(bob),
  join(cat),
  sit(ann, 0),
  sit(bob, 1),
  sit(cat, 2),
]);

const handStarted = (state: RoomState) => {
  const { table } = openOf(state);

  return TableStates.$is("InHand")(table) ? table.handNumber : 0;
};

const isDeck = Schema.is(DeckSchema);

const declare = (who: typeof ann, on: boolean) =>
  RoomCommands.DeclareStraddle({ at: ms(3), by: as(who), on });

const leading = (first: number) => {
  const bytes = new Uint8Array(256);

  bytes[0] = first;

  return bytes;
};

describe("the shuffle", () => {
  it("gives every one of the 52 cards the last position exactly as often from the 208 fair first bytes, and skips the other 48", () => {
    const counts = new Map<number, number>();
    let skipped = 0;

    for (let first = 0; first < 256; first += 1) {
      const deck = Result.getOrThrow(deckFromBytes(leading(first)));
      const zeroFirst = Result.getOrThrow(deckFromBytes(leading(0)));
      const last = deck[51] ?? -1;

      if (first >= 208) {
        skipped += deck.join(",") === zeroFirst.join(",") ? 1 : 0;
      } else {
        counts.set(last, (counts.get(last) ?? 0) + 1);
      }
    }

    expect(skipped).toBe(48);
    expect(counts.size).toBe(52);
    expect([...counts.values()].every((count) => count === 4)).toBe(true);
  });

  it("returns a full deck of distinct cards for any stream long enough", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const deck = Result.getOrThrow(deckFromBytes(bytesFrom(seed)));

      expect(isDeck(deck)).toBe(true);
    }
  });

  it("fails with the number of bytes it was given when they run out", () => {
    expect(deckFromBytes(new Uint8Array(20))).toStrictEqual(
      Result.fail(new ShuffleRanOut({ given: 20 }))
    );
  });
});

describe("dealing", () => {
  it("lets only the host start and pause, and refuses a repeat", () => {
    expect(
      rejection(seated, RoomCommands.StartGame({ at: ms(3), by: as(bob) }))
    ).toStrictEqual(new NotTheHost({ host: ann, player: bob }));

    const started = run(seated, start(3));

    expect(started.events).toStrictEqual([
      RoomEvents.GameStarted({ at: ms(3) }),
    ]);
    expect(rejection(started.state, start(4))).toStrictEqual(
      new GameAlready({ status: "Running" })
    );
    expect(
      rejection(seated, RoomCommands.PauseGame({ at: ms(3), by: as(ann) }))
    ).toStrictEqual(new GameAlready({ status: "Waiting" }));
  });

  it("deals the first hand at once, from the server only, with the deck the bytes shuffle", () => {
    const started = run(seated, start(3)).state;

    expect(rejection(seated, dealAt(3))).toStrictEqual(
      new DealNotDue({ due: Option.none(), reason: "Waiting" })
    );
    expect(
      rejection(
        started,
        RoomCommands.Deal({
          at: ms(3),
          by: as(ann),
          shuffleBytes: bytesFrom(1),
        })
      )
    ).toStrictEqual(new ServerOnly({ command: "Deal" }));

    const dealt = run(started, dealAt(3, 7));
    const [first] = dealt.events;

    expect(first).toStrictEqual(
      RoomEvents.Table({
        at: ms(3),
        event: Events.HandStarted({
          bigBlindSeat: seat(2),
          button: seat(0),
          dealtIn: [seat(0), seat(1), seat(2)],
          deck: Result.getOrThrow(deckFromBytes(bytesFrom(7))),
          handNumber: 1,
          smallBlindSeat: seat(1),
        }),
      })
    );
    expect(handStarted(dealt.state)).toBe(1);
    expect(rejection(dealt.state, dealAt(4))).toStrictEqual(
      new DealNotDue({ due: Option.none(), reason: "HandInProgress" })
    );
  });
});

describe("sitting out and straddles", () => {
  it("passes sitting out to the table, so the next deal skips the seat", () => {
    const out = run(seated, RoomCommands.SitOut({ at: ms(3), by: as(cat) }));

    expect(out.events).toStrictEqual([
      RoomEvents.Table({
        at: ms(3),
        event: Events.SittingOutChanged({ seat: seat(2), sittingOut: true }),
      }),
    ]);

    const dealt = runAll(out.state, [start(4), dealAt(4)]);
    const { table } = openOf(dealt);

    expect(
      TableStates.$is("InHand")(table) &&
        table.hand.players.map((player) => player.seat)
    ).toStrictEqual([seat(0), seat(1)]);
  });

  it("records a standing straddle choice only for a seated member", () => {
    expect(
      rejection(runAll(seated, [join(dan)]), declare(dan, true))
    ).toStrictEqual(new NotSeated({ player: dan }));

    const declared = run(seated, declare(bob, true));

    expect(declared.events).toStrictEqual([
      RoomEvents.StraddleDeclared({ at: ms(3), on: true, player: bob }),
    ]);
    expect(run(declared.state, declare(bob, true)).events).toStrictEqual([]);
    expect(
      openOf(run(declared.state, declare(bob, false)).state).straddlers
    ).toStrictEqual([]);
  });
});
