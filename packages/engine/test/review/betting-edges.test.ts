import { describe, expect, it } from "@effect/vitest";

import { Events } from "../../src/index.js";
import type { TableConfig } from "../../src/index.js";
import {
  baseConfig,
  calls,
  checks,
  chipCount,
  deckStartingWith,
  folds,
  legalOf,
  occupiedTable,
  play,
  raisesTo,
  seat,
  startHand,
} from "../fixtures.js";
import { legal } from "./legal.js";

const deck = deckStartingWith("Ac Kc Qc Jc Tc 9c 2d 3d 4d 5h 6h 7s 8s 9s");

const straddles = (underTheGun: number, button: boolean): TableConfig => ({
  ...baseConfig,
  straddle: { button, underTheGun },
});

const flopWithShortButton = (buttonStack: number) =>
  play(
    startHand(
      occupiedTable(baseConfig, {
        0: buttonStack,
        1: 1000,
        2: 1000,
        3: 1000,
      }),
      deck
    ).state,
    [
      [3, calls],
      [0, calls],
      [1, calls],
      [2, checks],
      [1, checks],
      [2, checks],
      [3, raisesTo(100)],
    ]
  ).state;

describe("raising edges (rules 7, 8, 11, 12)", () => {
  it("Rule 12: an all-in for exactly the minimum raise is a full raise and reopens the betting for the bettor", () => {
    const shoved = play(flopWithShortButton(210), [[0, raisesTo(200)]]);

    expect(shoved.events).toStrictEqual([
      Events.RaisedTo({
        added: chipCount(200),
        allIn: true,
        full: true,
        seat: seat(0),
        to: chipCount(200),
      }),
    ]);
    expect(
      legalOf(
        play(shoved.state, [
          [1, calls],
          [2, folds],
        ]).state
      )
    ).toStrictEqual(legal(3, false, 100, [300, 990]));
  });

  it("Rule 12: an all-in one chip short of the minimum raise does not reopen the betting for the bettor", () => {
    const shoved = play(flopWithShortButton(209), [[0, raisesTo(199)]]);

    expect(shoved.events).toStrictEqual([
      Events.RaisedTo({
        added: chipCount(199),
        allIn: true,
        full: false,
        seat: seat(0),
        to: chipCount(199),
      }),
    ]);
    expect(
      legalOf(
        play(shoved.state, [
          [1, calls],
          [2, folds],
        ]).state
      )
    ).toStrictEqual(legal(3, false, 99, null));
  });

  it("Rule 11: a preflop all-in raise larger than one big blind is full, and the next raise must add as much again", () => {
    const shoved = play(
      startHand(
        occupiedTable(baseConfig, { 0: 1000, 1: 1000, 2: 1000, 3: 25 }),
        deck
      ).state,
      [[3, raisesTo(25)]]
    );

    expect(shoved.events).toStrictEqual([
      Events.RaisedTo({
        added: chipCount(25),
        allIn: true,
        full: true,
        seat: seat(3),
        to: chipCount(25),
      }),
    ]);
    expect(legalOf(shoved.state)).toStrictEqual(
      legal(0, false, 25, [40, 1000])
    );
    expect(legalOf(play(shoved.state, [[0, calls]]).state)).toStrictEqual(
      legal(1, false, 20, [40, 1000])
    );
  });

  it("Rule 7: over a big blind all in for 4, the call is the full big blind and the minimum raise is to twice it", () => {
    const started = startHand(
      occupiedTable(baseConfig, { 0: 1000, 1: 1000, 2: 4, 3: 1000 }),
      deck
    ).state;

    expect(legalOf(started)).toStrictEqual(legal(3, false, 10, [20, 1000]));
  });

  it("Rule 8: after a double straddle the second straddler keeps its option, and every raise must reach twice the double straddle", () => {
    const started = startHand(
      occupiedTable(straddles(2, false), {
        0: 1000,
        1: 1000,
        2: 1000,
        3: 1000,
        4: 1000,
      }),
      deck,
      [3, 4]
    ).state;

    expect(legalOf(started)).toStrictEqual(legal(0, false, 40, [80, 1000]));

    const limped = play(started, [
      [0, calls],
      [1, calls],
      [2, calls],
    ]).state;

    expect(legalOf(limped)).toStrictEqual(legal(3, false, 20, [80, 1000]));
    expect(legalOf(play(limped, [[3, calls]]).state)).toStrictEqual(
      legal(4, true, null, [80, 1000])
    );
  });
});

describe("acting order edges (rules 2 and 10)", () => {
  it("Rule 10: three-handed, the button's under-the-gun straddle makes the small blind act first and the button act last, then the small blind opens the flop", () => {
    const started = startHand(
      occupiedTable(straddles(1, false), { 2: 1000, 5: 1000, 7: 1000 }),
      deck,
      [2]
    ).state;

    expect(legalOf(started)).toStrictEqual(legal(5, false, 15, [40, 1000]));

    const toButton = play(started, [
      [5, calls],
      [7, calls],
    ]).state;

    expect(legalOf(toButton)).toStrictEqual(legal(2, true, null, [40, 1000]));
    expect(legalOf(play(toButton, [[2, checks]]).state)).toStrictEqual(
      legal(5, true, null, [10, 980])
    );
  });

  it("Rule 10: with a button straddle and the small blind all in for 3, the big blind acts first and the button last", () => {
    const started = startHand(
      occupiedTable(straddles(0, true), {
        0: 1000,
        1: 3,
        2: 1000,
        3: 1000,
      }),
      deck,
      [0]
    ).state;

    expect(legalOf(started)).toStrictEqual(legal(2, false, 10, [40, 1000]));

    const toButton = play(started, [
      [2, calls],
      [3, calls],
    ]).state;

    expect(legalOf(toButton)).toStrictEqual(legal(0, true, null, [40, 1000]));
    expect(legalOf(play(toButton, [[0, checks]]).state)).toStrictEqual(
      legal(2, true, null, [10, 980])
    );
  });

  it("Rule 10: after the flop the first Active seat clockwise from the button acts, skipping a small blind that folded or is all in", () => {
    const folded = play(
      startHand(
        occupiedTable(baseConfig, { 0: 1000, 1: 1000, 2: 1000, 3: 1000 }),
        deck
      ).state,
      [
        [3, calls],
        [0, calls],
        [1, folds],
        [2, checks],
      ]
    ).state;

    const allIn = play(
      startHand(
        occupiedTable(baseConfig, { 0: 1000, 1: 10, 2: 1000, 3: 1000 }),
        deck
      ).state,
      [
        [3, calls],
        [0, calls],
        [1, calls],
        [2, checks],
      ]
    ).state;

    expect([legalOf(folded), legalOf(allIn)]).toStrictEqual([
      legal(2, true, null, [10, 990]),
      legal(2, true, null, [10, 990]),
    ]);
  });
});
