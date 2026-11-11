import { describe, expect, it } from "@effect/vitest";

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
  occupiedTable,
  play,
  runCount,
  seat,
  stacksOf,
  startHand,
} from "./fixtures.js";

const BOARD = "2h 5d 9c Jh 4d";

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

describe("antes", () => {
  it("with a seat all in for less than the ante, the small blind has nothing to decide once the button folds: its blind comes back and the button's unmatched ante goes to the side pot", () => {
    const config: TableConfig = {
      ...baseConfig,
      ante: Antes.EveryPlayer({ amount: chipCount(2) }),
    };

    const hand = play(
      startHand(
        occupiedTable(config, { 0: 100, 1: 100, 2: 1 }),
        deckStartingWith(`Kh Ah 7c Kd As 3s ${BOARD}`)
      ).state,
      [[0, folds]]
    );

    expect(hand.events).toStrictEqual([
      Events.Folded({ seat: seat(0) }),
      Events.UncalledBetReturned({ amount: chipCount(5), seat: seat(1) }),
      Events.RunsAgreed({ runs: runCount(1) }),
      Events.HandsTabled({
        hands: [
          { cards: cards("Kh Kd"), seat: seat(1) },
          { cards: cards("Ah As"), seat: seat(2) },
        ],
      }),
      Events.StreetDealt({ cards: cards("2h 5d 9c"), run: 1, street: "Flop" }),
      Events.StreetDealt({ cards: cards("Jh"), run: 1, street: "Turn" }),
      Events.StreetDealt({ cards: cards("4d"), run: 1, street: "River" }),
      Events.ShowdownReached({
        order: [shown(1, "Kh Kd"), shown(2, "Ah As")],
        run: 1,
      }),
      pot(1, 3, [1, 2], 2),
      pot(2, 2, [1], 1),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(hand.state).slice(0, 3)).toStrictEqual([98, 100, 3]);
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
