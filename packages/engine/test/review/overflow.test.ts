import { describe, expect, it } from "@effect/vitest";

import {
  ChipLimitExceeded,
  Commands,
  Events,
  StraddleAboveChipLimit,
  StraddleNotAllowed,
  initialTable,
  invariants,
} from "../../src/index.js";
import type { TableConfig } from "../../src/index.js";
import {
  baseConfig,
  calls,
  chipCount,
  deckStartingWith,
  occupiedTable,
  play,
  player,
  raisesTo,
  rejection,
  run,
  seat,
  stacksOf,
  startHand,
} from "../fixtures.js";

const LIMIT = Number.MAX_SAFE_INTEGER;

const buyIn = (index: number, amount: number) =>
  Commands.SitDown({
    buyIn: chipCount(amount),
    player: player(`newcomer${index}`),
    seat: seat(index),
  });

const addChips = (index: number, amount: number) =>
  Commands.AddChips({ amount: chipCount(amount), seat: seat(index) });

const limitExceeded = (index: number, amount: number, available: number) =>
  new ChipLimitExceeded({
    amount: chipCount(amount),
    available: chipCount(available),
    seat: seat(index),
  });

describe("the table holds at most Number.MAX_SAFE_INTEGER chips", () => {
  it("Chips: a buy-in that would lift the table past the limit is rejected with ChipLimitExceeded, so no pot can pass it", () => {
    const full = occupiedTable(baseConfig, { 0: LIMIT });

    expect([
      rejection(full, buyIn(1, 1)),
      rejection(full, buyIn(1, LIMIT)),
    ]).toStrictEqual([limitExceeded(1, 1, 0), limitExceeded(1, LIMIT, 0)]);
  });

  it("Chips: AddChips past the limit is rejected with the chips that still fit, and AddChips up to it exactly is accepted", () => {
    const table = occupiedTable(baseConfig, { 0: LIMIT - 101, 1: 100 });

    expect(rejection(table, addChips(0, 2))).toStrictEqual(
      limitExceeded(0, 2, 1)
    );
    expect(run(table, addChips(0, 1)).events).toStrictEqual([
      Events.ChipsAdded({ amount: chipCount(1), seat: seat(0) }),
    ]);
  });

  it("Chips: chips in the pot count toward the limit, so a seat outside the hand cannot buy in or add chips past it", () => {
    const seated = occupiedTable(baseConfig, {
      0: LIMIT - 201,
      1: 100,
      2: 100,
      3: 1,
    });

    const inHand = startHand(
      run(seated, Commands.SetSittingOut({ seat: seat(3), sittingOut: true }))
        .state,
      deckStartingWith("")
    ).state;

    expect([
      rejection(inHand, buyIn(4, 1)),
      rejection(inHand, addChips(3, 1)),
    ]).toStrictEqual([limitExceeded(4, 1, 0), limitExceeded(3, 1, 0)]);
  });
});

const straddling = (
  bigBlind: number,
  underTheGun: number,
  button: boolean
): TableConfig => ({
  ...baseConfig,
  bigBlind: chipCount(bigBlind),
  smallBlind: chipCount(1),
  straddle: { button, underTheGun },
});

const straddle = (seats: readonly number[]) =>
  Commands.StartHand({
    deck: deckStartingWith(""),
    straddles: seats.map((index) => seat(index)),
  });

describe("straddles that double past Number.MAX_SAFE_INTEGER", () => {
  it("Rule 8: a straddle chain whose second straddle would pass the limit is rejected as CannotCover, not thrown", () => {
    const table = occupiedTable(straddling(2 ** 51, 2, false), {
      0: 1000,
      1: 1000,
      2: 1000,
      3: 2 ** 52 + 1,
      4: 1000,
    });

    expect(rejection(table, straddle([3, 4]))).toStrictEqual(
      new StraddleNotAllowed({
        reason: "CannotCover",
        straddles: [seat(3), seat(4)],
      })
    );
  });

  it("Rule 8: a first straddle past the limit, under the gun or on the button, is rejected as CannotCover", () => {
    const deep = 2 ** 52 + 5;

    expect([
      rejection(
        occupiedTable(straddling(2 ** 52, 1, false), {
          0: 1000,
          1: 1000,
          2: 1000,
          3: deep,
        }),
        straddle([3])
      ),
      rejection(
        occupiedTable(straddling(2 ** 52, 0, true), {
          0: deep,
          1: 1000,
          2: 1000,
        }),
        straddle([0])
      ),
    ]).toStrictEqual([
      new StraddleNotAllowed({ reason: "CannotCover", straddles: [seat(3)] }),
      new StraddleNotAllowed({ reason: "CannotCover", straddles: [seat(0)] }),
    ]);
  });

  it("ChangeRules refuses rules whose longest straddle chain doubles past the limit and accepts one that stays within it", () => {
    const table = initialTable(baseConfig);

    const change = (config: TableConfig) =>
      rejection(table, Commands.ChangeRules({ config }));

    expect([
      change(straddling(2 ** 51, 2, false)),
      change(straddling(2 ** 52, 0, true)),
      change(straddling(2 ** 46, 6, true)),
      change(straddling(2 ** 52 - 1, 1, true)),
      change(straddling(LIMIT, 0, false)),
    ]).toStrictEqual([
      new StraddleAboveChipLimit({
        bigBlind: chipCount(2 ** 51),
        straddles: 2,
      }),
      new StraddleAboveChipLimit({
        bigBlind: chipCount(2 ** 52),
        straddles: 1,
      }),
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe("chip amounts at Number.MAX_SAFE_INTEGER", () => {
  it("Chips: a table holding exactly the limit plays an all-in to the end and still holds exactly the limit", () => {
    const half = Math.floor(LIMIT / 2);

    const hand = play(
      startHand(
        occupiedTable(baseConfig, { 0: half, 1: LIMIT - half }),
        deckStartingWith("Ac Kc Ad Kd 2h 7s 9c Jd 3h")
      ).state,
      [
        [0, raisesTo(half)],
        [1, calls],
      ]
    );

    expect(
      hand.events.filter((event) => Events.$is("PotAwarded")(event))
    ).toStrictEqual([
      Events.PotAwarded({
        amount: chipCount(LIMIT - 1),
        eligible: [seat(0), seat(1)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(LIMIT - 1), seat: seat(1) }],
      }),
    ]);
    expect(stacksOf(hand.state).slice(0, 2)).toStrictEqual([0, LIMIT]);
    expect(invariants(hand.state)).toStrictEqual([]);
  });
});
