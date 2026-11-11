import { describe, evaluate, rankOf } from "@nostakes/engine";
import type { Card, HandRank } from "@nostakes/engine";

const ONE: readonly string[] = [
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "jack",
  "queen",
  "king",
  "ace",
];

const MANY: readonly string[] = [
  "twos",
  "threes",
  "fours",
  "fives",
  "sixes",
  "sevens",
  "eights",
  "nines",
  "tens",
  "jacks",
  "queens",
  "kings",
  "aces",
];

const one = (rank: number) => ONE[rank] ?? "card";

const many = (rank: number) => MANY[rank] ?? "cards";

export const rankWord = one;

export const ranksWord = many;

export const handName = (rank: HandRank): string => {
  const { category, ranks } = describe(rank);
  const [first = 0, second = 0] = ranks;

  const named: Record<typeof category, () => string> = {
    Flush: () => `${one(first)}-high flush`,
    FourOfAKind: () => `four ${many(first)}`,
    FullHouse: () => `${many(first)} full of ${many(second)}`,
    HighCard: () => `${one(first)} high`,
    OnePair: () => `a pair of ${many(first)}`,
    RoyalFlush: () => "a royal flush",
    Straight: () => `${one(first)}-high straight`,
    StraightFlush: () => `${one(first)}-high straight flush`,
    ThreeOfAKind: () => `three ${many(first)}`,
    TwoPair: () => `${many(first)} and ${many(second)}`,
  };

  return named[category]();
};

export const capitalised = (text: string) =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

export const startingHandName = (cards: readonly Card[]): string => {
  const [high = 0, low = 0] = cards
    .map((card) => rankOf(card))
    .toSorted((left, right) => right - left);

  return high === low ? `pocket ${many(high)}` : `${one(high)}-${one(low)}`;
};

const fives = (cards: readonly Card[]): readonly (readonly Card[])[] => {
  if (cards.length <= 5) {
    return [cards];
  }

  return cards.flatMap((_, skipped) =>
    fives(cards.filter((__, index) => index !== skipped))
  );
};

export const bestFive = (
  hole: readonly Card[],
  board: readonly Card[]
): readonly Card[] => {
  const all = [...hole, ...board];
  const target = evaluate(all);

  return fives(all).find((five) => evaluate(five) === target) ?? all;
};
