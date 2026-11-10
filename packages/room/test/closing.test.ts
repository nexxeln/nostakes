import { describe, expect, it } from "@effect/vitest";
import { Actions, ChipsSchema } from "@nostakes/engine";
import { AmountSchema, NetSchema } from "@nostakes/ledger";
import { Result } from "effect";

import {
  CloseAlreadyQueued,
  NotTheHost,
  RoomCommands,
  RoomEvents,
  RoomIsClosed,
  RoomStates,
  SettlesAfterHand,
  settlement,
} from "../src/index.js";
import type { RoomEvent, Settlement } from "../src/index.js";
import {
  ann,
  as,
  bob,
  cat,
  dealAt,
  join,
  ms,
  player,
  openedBy,
  rejection,
  roomCode,
  run,
  runAll,
  seat,
  sit,
} from "./fixtures.js";

const close = (at: number, who = ann) =>
  RoomCommands.CloseRoom({ at: ms(at), by: as(who) });

const fold = (who: typeof ann, at = 20) =>
  RoomCommands.Act({ action: Actions.Fold(), at: ms(at), by: as(who) });

const dealt = runAll(openedBy(ann), [
  join(bob),
  join(cat),
  sit(ann, 0),
  sit(bob, 1),
  sit(cat, 2),
  RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
  dealAt(10),
]);

const afterOneHand = runAll(dealt, [fold(ann), fold(bob)]);

const finalSettlement: Settlement = {
  balances: [
    {
      boughtIn: 200,
      cashedOut: 200,
      net: NetSchema.make(0),
      player: ann,
    },
    {
      boughtIn: 200,
      cashedOut: 195,
      net: NetSchema.make(-5),
      player: bob,
    },
    {
      boughtIn: 200,
      cashedOut: 205,
      net: NetSchema.make(5),
      player: cat,
    },
  ],
  transfers: [{ amount: AmountSchema.make(5), from: bob, to: cat }],
};

const cashOuts = (at: number): readonly RoomEvent[] => [
  RoomEvents.CashedOut({
    amount: ChipsSchema.make(200),
    at: ms(at),
    player: ann,
    seat: seat(0),
  }),
  RoomEvents.CashedOut({
    amount: ChipsSchema.make(195),
    at: ms(at),
    player: bob,
    seat: seat(1),
  }),
  RoomEvents.CashedOut({
    amount: ChipsSchema.make(205),
    at: ms(at),
    player: cat,
    seat: seat(2),
  }),
];

describe("settlement", () => {
  it("treats every stack as cashed out between hands and refuses to settle during a hand", () => {
    expect(settlement(afterOneHand)).toStrictEqual(
      Result.succeed(finalSettlement)
    );
    expect(settlement(dealt)).toStrictEqual(
      Result.fail(new SettlesAfterHand({ handNumber: 1 }))
    );
  });
});

describe("closing", () => {
  it("stands every seat, records the cash-outs, and settles between hands", () => {
    const closed = run(afterOneHand, close(30));

    expect(closed.events).toStrictEqual([
      ...cashOuts(30),
      RoomEvents.RoomClosed({ at: ms(30), settlement: finalSettlement }),
    ]);
    expect(RoomStates.$is("Closed")(closed.state)).toBe(true);
    expect(settlement(closed.state)).toStrictEqual(
      Result.succeed(finalSettlement)
    );
    expect(rejection(closed.state, join(player("dee")))).toStrictEqual(
      new RoomIsClosed({ code: roomCode })
    );
  });

  it("lets only the host close", () => {
    expect(rejection(afterOneHand, close(30, bob))).toStrictEqual(
      new NotTheHost({ host: ann, player: bob })
    );
  });

  it("waits for the hand in progress, then closes in the batch that ends it", () => {
    const queued = run(dealt, close(15));

    expect(queued.events).toStrictEqual([
      RoomEvents.CloseQueued({ at: ms(15) }),
    ]);
    expect(rejection(queued.state, close(16))).toStrictEqual(
      new CloseAlreadyQueued({ handNumber: 1 })
    );

    const ended = runAll(queued.state, [fold(ann)]);
    const last = run(ended, fold(bob));

    expect(last.events.slice(-4)).toStrictEqual([
      ...cashOuts(20),
      RoomEvents.RoomClosed({ at: ms(20), settlement: finalSettlement }),
    ]);
    expect(RoomStates.$is("Closed")(last.state)).toBe(true);
  });
});
