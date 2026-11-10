import { describe, expect, it } from "@effect/vitest";
import { Actions, ChipsSchema } from "@nostakes/engine";
import { AmountSchema, NetSchema } from "@nostakes/ledger";
import { Option, Result } from "effect";

import {
  Audiences,
  CloseAlreadyQueued,
  Deadlines,
  NotTheHost,
  RoomCommands,
  RoomEvents,
  RoomIsClosed,
  RoomStates,
  RoomViews,
  SealedSeatsMoved,
  SettlesAfterHand,
  settlement,
  viewFor,
} from "../src/index.js";
import type { RoomEvent, RoomState, Settlement } from "../src/index.js";
import { dealFromBeacon, sealAt } from "./beacon.js";
import {
  ann,
  as,
  bob,
  cat,
  dealAt,
  join,
  ms,
  openOf,
  player,
  openedBy,
  rejection,
  roomCode,
  run,
  runAll,
  seat,
  server,
  settings,
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

const stall = (at: number) =>
  RoomCommands.NoteStall({
    at: ms(at),
    by: server,
    deadline: Deadlines.DealDue({ at: ms(at) }),
  });

const raisedTo = (to: number, at = 20) =>
  RoomCommands.Act({
    action: Actions.RaiseTo({ to: ChipsSchema.make(to) }),
    at: ms(at),
    by: as(ann),
  });

const evenSettlement: Settlement = {
  balances: [ann, bob, cat].map((who) => ({
    boughtIn: 200,
    cashedOut: 200,
    net: NetSchema.make(0),
    player: who,
  })),
  transfers: [],
};

const closingFor = (state: RoomState, at: number) => {
  const view = viewFor(state, Audiences.Spectator(), ms(at));

  return RoomViews.$is("Open")(view)
    ? Option.some(view.closing)
    : Option.none();
};

describe("ending a stalled night", () => {
  it("cancels the hand in play at once, gives every chip in the pot back to the seat that put it in, and settles", () => {
    const raised = run(dealt, raisedTo(30)).state;
    const stalled = run(raised, stall(25)).state;
    const ended = run(stalled, close(30));

    expect(ended.events).toStrictEqual([
      RoomEvents.HandCancelled({
        at: ms(30),
        hand: 1,
        restored: [ann, bob, cat].map((who, index) => ({
          player: who,
          seat: seat(index),
          stack: ChipsSchema.make(200),
        })),
      }),
      ...[ann, bob, cat].map((who, index) =>
        RoomEvents.CashedOut({
          amount: ChipsSchema.make(200),
          at: ms(30),
          player: who,
          seat: seat(index),
        })
      ),
      RoomEvents.RoomClosed({ at: ms(30), settlement: evenSettlement }),
    ]);
  });

  it("lets any member end the night once it is stalled, and only the host before", () => {
    expect(rejection(dealt, close(15, bob))).toStrictEqual(
      new NotTheHost({ host: ann, player: bob })
    );

    const ended = run(run(dealt, stall(25)).state, close(30, bob));

    expect(RoomStates.$is("Closed")(ended.state)).toBe(true);
    expect(ended.events.at(-1)).toStrictEqual(
      RoomEvents.RoomClosed({ at: ms(30), settlement: evenSettlement })
    );
  });

  it("ends a night whose queued close waits on a hand that can no longer finish", () => {
    const queued = run(dealt, close(15)).state;

    expect(rejection(queued, close(16))).toStrictEqual(
      new CloseAlreadyQueued({ handNumber: 1 })
    );

    const ended = run(run(queued, stall(20)).state, close(21));

    expect(ended.events[0]?._tag).toBe("HandCancelled");
    expect(RoomStates.$is("Closed")(ended.state)).toBe(true);
  });

  it("tells every viewer what ending the night would do now", () => {
    expect(
      [afterOneHand, dealt, run(dealt, stall(25)).state].map((state) =>
        closingFor(state, 30)
      )
    ).toStrictEqual([
      Option.some("Now"),
      Option.some("AfterHand"),
      Option.some("CancelsHand"),
    ]);
  });
});

describe("ending a night whose sealed hand the room cannot deal", () => {
  const checked = {
    ...settings,
    betweenHandsSeconds: 5,
    shuffle: "Checked" as const,
  };

  const START = 10_000;

  const ROUND_DUE = 15_000;

  const sealed = run(
    runAll(openedBy(ann, checked), [
      join(bob),
      join(cat),
      sit(ann, 0),
      sit(bob, 1),
      sit(cat, 2),
      RoomCommands.StartGame({ at: ms(START), by: as(ann) }),
    ]),
    sealAt(START, 1)
  ).state;

  const misSealed: RoomState = {
    ...openOf(sealed),
    sealed: openOf(sealed).sealed.pipe(
      Option.map((seal) => ({ ...seal, seats: seal.seats.toReversed() }))
    ),
  };

  it("says the same thing about ending the night whenever a view of one state is drawn, so a late welcome matches the log", () => {
    expect(
      [START, ROUND_DUE].map((at) => closingFor(sealed, at))
    ).toStrictEqual([Option.some("Now"), Option.some("Now")]);
  });

  it("queues the close while the seal binds, and once the room is stalled withdraws the seal and settles", () => {
    const { round } = Option.getOrThrow(openOf(misSealed).sealed);

    expect(
      rejection(misSealed, dealFromBeacon(ROUND_DUE, round))
    ).toBeInstanceOf(SealedSeatsMoved);

    const queued = run(misSealed, close(ROUND_DUE));

    expect(queued.events).toStrictEqual([
      RoomEvents.CloseQueued({ at: ms(ROUND_DUE) }),
    ]);

    const ended = run(
      run(queued.state, stall(ROUND_DUE + 1)).state,
      close(ROUND_DUE + 2)
    );

    expect(ended.events[0]).toStrictEqual(
      RoomEvents.SealWithdrawn({
        at: ms(ROUND_DUE + 2),
        hand: 1,
        reason: "RoomClosing",
        round,
      })
    );
    expect(ended.events.at(-1)).toStrictEqual(
      RoomEvents.RoomClosed({
        at: ms(ROUND_DUE + 2),
        settlement: evenSettlement,
      })
    );
  });
});
