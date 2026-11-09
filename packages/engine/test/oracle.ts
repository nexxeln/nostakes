import { Schema } from "effect";

import { CardSchema } from "../src/index.js";
import type { Card } from "../src/index.js";

export const ALL_CARDS: readonly Card[] = Schema.decodeSync(
  Schema.Array(CardSchema)
)(Array.from({ length: 52 }, (_, card) => card));

const WHEEL_HIGH = 3;

const descending = (values: readonly number[]) =>
  values.toSorted((left, right) => right - left);

const groupsOf = (sortedRanks: readonly number[]) => {
  const groups: { count: number; rank: number }[] = [];

  for (const rank of sortedRanks) {
    const last = groups.at(-1);

    if (last?.rank === rank) {
      last.count += 1;
    } else {
      groups.push({ count: 1, rank });
    }
  }

  return groups.toSorted(
    (left, right) => right.count - left.count || right.rank - left.rank
  );
};

const straightHighOf = (sortedRanks: readonly number[]) => {
  const [first = 0, second = 0, third = 0, fourth = 0, fifth = 0] = sortedRanks;
  const distinct = new Set(sortedRanks).size === 5;

  if (distinct && first - fifth === 4) {
    return first;
  }

  if (
    distinct &&
    first === 12 &&
    second === 3 &&
    third === 2 &&
    fourth === 1 &&
    fifth === 0
  ) {
    return WHEEL_HIGH;
  }

  return -1;
};

export const classifyFive = (cards: readonly Card[]): readonly number[] => {
  const ranks = descending(cards.map((card) => Math.floor(card / 4)));
  const flush = cards.every((card) => card % 4 === (cards[0] ?? 0) % 4);
  const groups = groupsOf(ranks);
  const countPattern = groups.map((group) => group.count).join("");
  const ordered = groups.map((group) => group.rank);
  const straightHigh = straightHighOf(ranks);

  if (straightHigh >= 0 && flush) {
    return [8, straightHigh];
  }

  if (countPattern === "41") {
    return [7, ...ordered];
  }

  if (countPattern === "32") {
    return [6, ...ordered];
  }

  if (flush) {
    return [5, ...ranks];
  }

  if (straightHigh >= 0) {
    return [4, straightHigh];
  }

  if (countPattern === "311") {
    return [3, ...ordered];
  }

  if (countPattern === "221") {
    return [2, ...ordered];
  }

  if (countPattern === "2111") {
    return [1, ...ordered];
  }

  return [0, ...ranks];
};

export const oracleKey = (tuple: readonly number[]) => {
  let key = 0;

  for (let index = 0; index < 6; index += 1) {
    key = key * 16 + (tuple[index] ?? 0);
  }

  return key;
};

const CHOOSE: readonly (readonly number[])[] = Array.from(
  { length: 53 },
  (_unused, n) =>
    Array.from({ length: 6 }, (_ignored, k) => {
      let value = 1;

      for (let step = 0; step < k; step += 1) {
        value = (value * (n - step)) / (step + 1);
      }

      return value;
    })
);

const colexIndex = (ascending: readonly number[]) => {
  let index = 0;

  for (const [position, card] of ascending.entries()) {
    index += CHOOSE[card]?.[position + 1] ?? 0;
  }

  return index;
};

const buildFiveCardTable = () => {
  const table = new Float64Array(CHOOSE[52]?.[5] ?? 0);
  const hand: Card[] = [];

  const choose = (start: number) => {
    if (hand.length === 5) {
      table[colexIndex(hand)] = oracleKey(classifyFive(hand));

      return;
    }

    for (const card of ALL_CARDS.slice(start)) {
      hand.push(card);
      choose(card + 1);
      hand.pop();
    }
  };

  choose(0);

  return table;
};

export const FIVE_CARD_ORACLE = buildFiveCardTable();

export const oracleFive = (cards: readonly Card[]) =>
  FIVE_CARD_ORACLE[colexIndex(cards.toSorted((left, right) => left - right))] ??
  -1;

export const oracleSeven = (cards: readonly Card[]) => {
  const ascending = cards.toSorted((left, right) => left - right);
  let best = -1;

  for (let first = 0; first < ascending.length; first += 1) {
    for (let second = first + 1; second < ascending.length; second += 1) {
      const subset = ascending.filter(
        (_, index) => index !== first && index !== second
      );

      best = Math.max(best, FIVE_CARD_ORACLE[colexIndex(subset)] ?? -1);
    }
  }

  return best;
};
