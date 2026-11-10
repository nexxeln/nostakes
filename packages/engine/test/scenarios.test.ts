import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { Antes, Events, ShowdownEntries, evaluate } from "../src/index.js";
import type { TableConfig } from "../src/index.js";
import {
  baseConfig,
  calls,
  cards,
  checks,
  chipCount,
  deckStartingWith,
  folds,
  legalOf,
  occupiedTable,
  play,
  raisesTo,
  seat,
  stacksOf,
  startHand,
} from "./fixtures.js";

const BOARD = "2h 5d 9c Jh 4d";

const deck = deckStartingWith("Ac Kc Qc Jc Tc 9c 8c 7c 6c 5c 4c 3c 2c");

const shown = (index: number, hole: string) =>
  ShowdownEntries.Shown({
    cards: cards(hole),
    rank: evaluate(cards(`${hole} ${BOARD}`)),
    seat: seat(index),
  });

const mucked = (index: number) => ShowdownEntries.Mucked({ seat: seat(index) });

const pot = (
  number: number,
  amount: number,
  eligible: readonly number[],
  winner: number
) =>
  Events.PotAwarded({
    amount: chipCount(amount),
    eligible: eligible.map((index) => seat(index)),
    pot: number,
    run: 1,
    winners: [{ amount: chipCount(amount), seat: seat(winner) }],
  });

const checkAround = (seats: readonly number[]) =>
  seats.map((index) => [index, checks] as const);

describe("pots", () => {
  it("splits a three-way showdown into a main pot and two side pots, with a fold before the river", () => {
    const hand = play(
      startHand(
        occupiedTable(baseConfig, { 0: 1000, 1: 40, 2: 90, 3: 1000, 4: 1000 }),
        deckStartingWith(`As Ks 2s 3s Qs Ac Kc 7c 8c Qc ${BOARD}`)
      ).state,
      [
        [3, raisesTo(30)],
        [4, calls],
        [0, calls],
        [1, raisesTo(40)],
        [2, raisesTo(90)],
        [3, calls],
        [4, folds],
        [0, calls],
        [3, raisesTo(200)],
        [0, calls],
        ...checkAround([3, 0, 3]),
        [0, raisesTo(300)],
        [3, folds],
      ]
    );

    expect(hand.events.slice(-6)).toStrictEqual([
      Events.UncalledBetReturned({ amount: chipCount(300), seat: seat(0) }),
      Events.ShowdownReached({
        order: [shown(0, "Qs Qc"), shown(1, "As Ac"), shown(2, "Ks Kc")],
        run: 1,
      }),
      pot(1, 190, [0, 1, 2], 1),
      pot(2, 150, [0, 2], 2),
      pot(3, 400, [0], 0),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(hand.state).slice(0, 5)).toStrictEqual([
      1110, 190, 150, 710, 970,
    ]);
  });
});

describe("antes", () => {
  it("lets a seat all in for the every-player ante alone win only the ante from each seat", () => {
    const config: TableConfig = {
      ...baseConfig,
      ante: Antes.EveryPlayer({ amount: chipCount(2) }),
    };

    const hand = play(
      startHand(
        occupiedTable(config, { 0: 100, 1: 100, 2: 100, 3: 2 }),
        deckStartingWith(`Ks 2s As 3s Kc 7c Ac 8c ${BOARD}`)
      ).state,
      [
        [0, calls],
        [1, calls],
        [2, checks],
        ...checkAround([1, 2, 0, 1, 2, 0, 1, 2, 0]),
      ]
    );

    expect(hand.events.slice(-4)).toStrictEqual([
      Events.ShowdownReached({
        order: [shown(1, "Ks Kc"), mucked(2), shown(3, "As Ac"), mucked(0)],
        run: 1,
      }),
      pot(1, 8, [0, 1, 2, 3], 3),
      pot(2, 30, [0, 1, 2], 1),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(hand.state).slice(0, 4)).toStrictEqual([88, 118, 88, 8]);
  });

  it("gives each folder back the ante chips a seat all in for less than the ante could never match", () => {
    const config: TableConfig = {
      ...baseConfig,
      ante: Antes.EveryPlayer({ amount: chipCount(2) }),
    };

    const hand = play(
      startHand(occupiedTable(config, { 0: 100, 1: 100, 2: 1 }), deck).state,
      [
        [0, folds],
        [1, folds],
      ]
    );

    expect(hand.events).toStrictEqual([
      Events.Folded({ seat: seat(0) }),
      Events.Folded({ seat: seat(1) }),
      Events.UncalledBetReturned({ amount: chipCount(6), seat: seat(1) }),
      Events.UncalledBetReturned({ amount: chipCount(1), seat: seat(0) }),
      pot(1, 3, [2], 2),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(hand.state).slice(0, 3)).toStrictEqual([99, 99, 3]);
  });

  it("puts the big-blind ante into the main pot that a short big blind can still win", () => {
    const config: TableConfig = {
      ...baseConfig,
      ante: Antes.BigBlindPays({ amount: chipCount(3) }),
    };

    const hand = play(
      startHand(
        occupiedTable(config, { 0: 100, 1: 100, 2: 12 }),
        deckStartingWith(`Ks As 2s Kc Ac 7c ${BOARD}`)
      ).state,
      [[0, calls], [1, calls], ...checkAround([1, 0, 1, 0, 1, 0])]
    );

    expect(hand.events.slice(-3)).toStrictEqual([
      Events.ShowdownReached({
        order: [shown(1, "Ks Kc"), shown(2, "As Ac"), mucked(0)],
        run: 1,
      }),
      pot(1, 32, [0, 1, 2], 2),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(hand.state).slice(0, 3)).toStrictEqual([90, 90, 32]);
  });
});

const straddling: TableConfig = {
  ...baseConfig,
  straddle: { button: true, underTheGun: 2 },
};

const fiveHanded = () =>
  occupiedTable(straddling, { 0: 500, 1: 500, 2: 500, 3: 500, 4: 500 });

describe("straddles", () => {
  it("gives an under-the-gun straddler the last word before the flop, with a raise to at least twice the straddle", () => {
    const limped = play(startHand(fiveHanded(), deck, [3]).state, [
      [4, calls],
      [0, calls],
      [1, calls],
      [2, calls],
    ]);

    expect(legalOf(limped.state)).toMatchObject({
      canCheck: true,
      seat: seat(3),
    });
    expect(legalOf(limped.state).raise).toStrictEqual(
      Option.some({ maxTo: chipCount(500), minTo: chipCount(40) })
    );

    const flop = play(limped.state, [[3, checks]]);

    expect(flop.events.filter(Events.$is("StreetDealt"))).toHaveLength(1);
    expect(legalOf(flop.state).seat).toBe(seat(1));
  });

  it("starts with the small blind after a button straddle and gives the button the last word", () => {
    const limped = play(startHand(fiveHanded(), deck, [0]).state, [
      [1, calls],
      [2, calls],
      [3, calls],
      [4, calls],
    ]);

    expect(legalOf(limped.state)).toMatchObject({
      canCheck: true,
      seat: seat(0),
    });
    expect(legalOf(limped.state).raise).toStrictEqual(
      Option.some({ maxTo: chipCount(500), minTo: chipCount(40) })
    );
  });
});
