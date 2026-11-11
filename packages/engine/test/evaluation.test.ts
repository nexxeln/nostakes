import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  CardFromText,
  describe as describeHand,
  evaluate,
  handCategory,
} from "../src/index.js";
import type { Card, HandCategory } from "../src/index.js";
import { ALL_CARDS, oracleFive, oracleSeven } from "./oracle.js";
import { seededRandom } from "./random.js";
import { sized } from "./scale.js";

const decodeCard = Schema.decodeSync(CardFromText);

const cardsOf = (text: string) =>
  text.split(" ").map((card) => decodeCard(card));

const describedHand = (text: string) => describeHand(evaluate(cardsOf(text)));

const fullDeck = ALL_CARDS;

const SEVEN_CARD_SAMPLES = sized(300_000, 3_000_000);

const agreement = () => {
  const engineByOracle = new Map<number, number>();
  const oracleByEngine = new Map<number, number>();
  const conflicts: string[] = [];

  const record = (cards: readonly Card[], oracle: number, engine: number) => {
    const knownEngine = engineByOracle.get(oracle);
    const knownOracle = oracleByEngine.get(engine);

    if (
      (knownEngine ?? engine) !== engine ||
      (knownOracle ?? oracle) !== oracle
    ) {
      conflicts.push(cards.join(","));
    }

    engineByOracle.set(oracle, engine);
    oracleByEngine.set(engine, oracle);
  };

  const outOfOrder = () => {
    const engineValues = [...engineByOracle.entries()]
      .toSorted(([left], [right]) => left - right)
      .map(([, engine]) => engine);

    return engineValues.filter(
      (engine, index) => index > 0 && engine <= (engineValues[index - 1] ?? 0)
    ).length;
  };

  return { classes: () => engineByOracle.size, conflicts, outOfOrder, record };
};

const sampleSeven = (
  deck: readonly Card[],
  random: ReturnType<typeof seededRandom>
) => {
  const pool = [...deck];
  const chosen: Card[] = [];

  for (let drawn = 0; drawn < 7; drawn += 1) {
    const index = drawn + random.below(pool.length - drawn);
    const card = pool[index] ?? pool[drawn] ?? fullDeck[0];
    const swapped = pool[drawn] ?? card;

    if (card !== undefined && swapped !== undefined) {
      pool[index] = swapped;
      pool[drawn] = card;
      chosen.push(card);
    }
  }

  return chosen;
};

describe("evaluate", () => {
  it("orders every five-card hand exactly as the oracle does, ties included", () => {
    const check = agreement();
    const counts = new Map<HandCategory, number>();
    const hand: Card[] = [];

    const choose = (start: number) => {
      if (hand.length === 5) {
        const rank = evaluate(hand);

        check.record(hand, oracleFive(hand), rank);
        counts.set(
          handCategory(rank),
          (counts.get(handCategory(rank)) ?? 0) + 1
        );

        return;
      }

      for (const [offset, card] of fullDeck.slice(start).entries()) {
        hand.push(card);
        choose(start + offset + 1);
        hand.pop();
      }
    };

    choose(0);

    expect(check.conflicts).toStrictEqual([]);
    expect(check.outOfOrder()).toBe(0);
    expect(check.classes()).toBe(7462);
    expect(Object.fromEntries(counts)).toStrictEqual({
      Flush: 5108,
      FourOfAKind: 624,
      FullHouse: 3744,
      HighCard: 1_302_540,
      OnePair: 1_098_240,
      RoyalFlush: 4,
      Straight: 10_200,
      StraightFlush: 36,
      ThreeOfAKind: 54_912,
      TwoPair: 123_552,
    });
  }, 120_000);

  it("orders a large sample of random seven-card hands exactly as the oracle does", () => {
    const check = agreement();
    const random = seededRandom(20_261_110);
    const twoSuits = fullDeck.filter((card) => card % 4 < 2);
    const sevenRanks = fullDeck.filter((card) => card >= 24);
    const decks = [fullDeck, twoSuits, sevenRanks];

    for (let sample = 0; sample < SEVEN_CARD_SAMPLES; sample += 1) {
      const hand = sampleSeven(
        decks[sample % decks.length] ?? fullDeck,
        random
      );

      check.record(hand, oracleSeven(hand), evaluate(hand));
    }

    expect(check.conflicts).toStrictEqual([]);
    expect(check.outOfOrder()).toBe(0);
    expect(check.classes()).toBeGreaterThan(4000);
  }, 300_000);

  it("names the category and the ranks that decide ties", () => {
    expect(describedHand("As Ks Qs Js Ts 2c 3d")).toStrictEqual({
      category: "RoyalFlush",
      ranks: [12],
    });
    expect(describedHand("5h 4h 3h 2h Ah Kc Kd")).toStrictEqual({
      category: "StraightFlush",
      ranks: [3],
    });
    expect(describedHand("9c 9d 9h 9s Ac 2d 2h")).toStrictEqual({
      category: "FourOfAKind",
      ranks: [7, 12],
    });
    expect(describedHand("Ah Ad Ac Kh Kd Kc 2s")).toStrictEqual({
      category: "FullHouse",
      ranks: [12, 11],
    });
    expect(describedHand("Kh 9h 7h 4h 2h Qh 3c")).toStrictEqual({
      category: "Flush",
      ranks: [11, 10, 7, 5, 2],
    });
    expect(describedHand("9c 8d 7h 6s 5c 4d 2h")).toStrictEqual({
      category: "Straight",
      ranks: [7],
    });
    expect(describedHand("5c 4d 3h 2s Ac Kd 9h")).toStrictEqual({
      category: "Straight",
      ranks: [3],
    });
    expect(describedHand("7c 7d 7h Ks 2c 3d 9h")).toStrictEqual({
      category: "ThreeOfAKind",
      ranks: [5, 11, 7],
    });
    expect(describedHand("Ah Ad Kh Kd Qh Qd 2c")).toStrictEqual({
      category: "TwoPair",
      ranks: [12, 11, 10],
    });
    expect(describedHand("2c 2d 9h Js Kc 4d 6h")).toStrictEqual({
      category: "OnePair",
      ranks: [0, 11, 9, 7],
    });
    expect(describedHand("Ac Qd 9h 7s 5c 3d 2h")).toStrictEqual({
      category: "HighCard",
      ranks: [12, 10, 7, 5, 3],
    });
  });
});
