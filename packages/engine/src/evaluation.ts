import { Schema } from "effect";

import { CARD_RANKS, CARD_SUITS, RANKS, SUITS } from "./cards.js";
import type { Card } from "./cards.js";

const HIGH_CARD = 0;

const ONE_PAIR = 1;

const TWO_PAIR = 2;

const THREE_OF_A_KIND = 3;

const STRAIGHT = 4;

const FLUSH = 5;

const FULL_HOUSE = 6;

const FOUR_OF_A_KIND = 7;

const STRAIGHT_FLUSH = 8;

const ACE = 12;

const FIVE = 3;

const KICKER_DIGITS = 5;

const CATEGORY_SCALE = RANKS ** KICKER_DIGITS;

const SMALLEST_HAND = 5;

const LARGEST_HAND = 7;

const FLUSH_LENGTH = 5;

export const HandRankSchema = Schema.Int.check(
  Schema.isBetween({
    maximum: (STRAIGHT_FLUSH + 1) * CATEGORY_SCALE,
    minimum: 0,
  })
).pipe(Schema.brand("HandRank"));

export type HandRank = typeof HandRankSchema.Type;

export const HandCategorySchema = Schema.Literals([
  "HighCard",
  "OnePair",
  "TwoPair",
  "ThreeOfAKind",
  "Straight",
  "Flush",
  "FullHouse",
  "FourOfAKind",
  "StraightFlush",
  "RoyalFlush",
]);

export type HandCategory = typeof HandCategorySchema.Type;

const CATEGORY_NAMES: readonly HandCategory[] = [
  "HighCard",
  "OnePair",
  "TwoPair",
  "ThreeOfAKind",
  "Straight",
  "Flush",
  "FullHouse",
  "FourOfAKind",
  "StraightFlush",
];

const SIGNIFICANT_RANKS: readonly number[] = [5, 4, 3, 3, 1, 5, 2, 2, 1];

const encodeHand = (category: number, ranks: readonly number[]) => {
  let value = category;

  for (let digit = 0; digit < KICKER_DIGITS; digit += 1) {
    value = value * RANKS + (ranks[digit] ?? 0);
  }

  return value;
};

const straightTop = (present: (rank: number) => boolean) => {
  for (let top = ACE; top >= FIVE; top -= 1) {
    let length = 0;

    while (
      length < 5 &&
      present(top === FIVE && length === 4 ? ACE : top - length)
    ) {
      length += 1;
    }

    if (length === 5) {
      return top;
    }
  }

  return -1;
};

const ranksDescending = (counts: readonly number[], minimum: number) => {
  const ranks: number[] = [];

  for (let rank = ACE; rank >= 0; rank -= 1) {
    if ((counts[rank] ?? 0) >= minimum) {
      ranks.push(rank);
    }
  }

  return ranks;
};

const kickersExcept = (
  counts: readonly number[],
  excluded: readonly number[],
  wanted: number
) =>
  ranksDescending(counts, 1)
    .filter((rank) => !excluded.includes(rank))
    .slice(0, wanted);

const bestWithoutFlush = (counts: readonly number[]) => {
  const quads = ranksDescending(counts, 4);
  const trips = ranksDescending(counts, 3);
  const pairs = ranksDescending(counts, 2);
  const [quad] = quads;

  if (quad !== undefined) {
    return encodeHand(FOUR_OF_A_KIND, [
      quad,
      ...kickersExcept(counts, [quad], 1),
    ]);
  }

  const [trip] = trips;
  const fullHousePair = pairs.find((rank) => rank !== trip);

  if (trip !== undefined && fullHousePair !== undefined) {
    return encodeHand(FULL_HOUSE, [trip, fullHousePair]);
  }

  const straight = straightTop((rank) => (counts[rank] ?? 0) > 0);

  if (straight >= 0) {
    return encodeHand(STRAIGHT, [straight]);
  }

  if (trip !== undefined) {
    return encodeHand(THREE_OF_A_KIND, [
      trip,
      ...kickersExcept(counts, [trip], 2),
    ]);
  }

  const [highPair, lowPair] = pairs;

  if (highPair !== undefined && lowPair !== undefined) {
    return encodeHand(TWO_PAIR, [
      highPair,
      lowPair,
      ...kickersExcept(counts, [highPair, lowPair], 1),
    ]);
  }

  if (highPair !== undefined) {
    return encodeHand(ONE_PAIR, [
      highPair,
      ...kickersExcept(counts, [highPair], 3),
    ]);
  }

  return encodeHand(HIGH_CARD, kickersExcept(counts, [], 5));
};

const QUINARY: readonly number[] = Array.from(
  { length: RANKS },
  (_, rank) => 5 ** rank
);

const BINARY: readonly number[] = Array.from(
  { length: RANKS },
  (_, rank) => 2 ** rank
);

const OCTAL: readonly number[] = Array.from(
  { length: SUITS },
  (_, suit) => 8 ** suit
);

const HASH_SLOTS = 262_144;

const LOWEST_HAND = HandRankSchema.make(0);

const buildRankTable = () => {
  const keys = new Int32Array(HASH_SLOTS);

  const values: HandRank[] = Array.from(
    { length: HASH_SLOTS },
    () => LOWEST_HAND
  );

  const counts: number[] = Array.from({ length: RANKS }, () => 0);

  const insert = (key: number, value: HandRank) => {
    let slot = key % HASH_SLOTS;

    while (keys[slot] !== 0) {
      slot = (slot + 1) % HASH_SLOTS;
    }

    keys[slot] = key;
    values[slot] = value;
  };

  const visit = (rank: number, cards: number, key: number) => {
    if (rank === RANKS) {
      if (cards >= SMALLEST_HAND) {
        insert(key, HandRankSchema.make(bestWithoutFlush(counts)));
      }

      return;
    }

    for (
      let count = 0;
      count <= SUITS && cards + count <= LARGEST_HAND;
      count += 1
    ) {
      counts[rank] = count;
      visit(rank + 1, cards + count, key + count * (QUINARY[rank] ?? 0));
    }

    counts[rank] = 0;
  };

  visit(0, 0, 0);

  return { keys, values };
};

const RANKS_DESCENDING: readonly number[] = Array.from(
  { length: RANKS },
  (_, index) => ACE - index
);

const bestFlush = (mask: number) => {
  const present = (rank: number) =>
    Math.floor(mask / (BINARY[rank] ?? 1)) % 2 === 1;

  const ranks = RANKS_DESCENDING.filter(present);

  if (ranks.length < FLUSH_LENGTH) {
    return LOWEST_HAND;
  }

  const top = straightTop(present);

  return HandRankSchema.make(
    top >= 0 ? encodeHand(STRAIGHT_FLUSH, [top]) : encodeHand(FLUSH, ranks)
  );
};

const buildFlushSuitTable = () =>
  Array.from({ length: 8 ** SUITS }, (_, key) => {
    for (let suit = 0; suit < SUITS; suit += 1) {
      if (Math.floor(key / (OCTAL[suit] ?? 1)) % 8 >= FLUSH_LENGTH) {
        return suit;
      }
    }

    return -1;
  });

const RANK_TABLE = buildRankTable();

const FLUSH_TABLE: readonly HandRank[] = Array.from(
  { length: 2 ** RANKS },
  (_, mask) => bestFlush(mask)
);

const FLUSH_SUIT: readonly number[] = buildFlushSuitTable();

const lookupWithoutFlush = (key: number) => {
  let slot = key % HASH_SLOTS;

  while (RANK_TABLE.keys[slot] !== key && RANK_TABLE.keys[slot] !== 0) {
    slot = (slot + 1) % HASH_SLOTS;
  }

  return RANK_TABLE.values[slot] ?? LOWEST_HAND;
};

const lookupFlush = (cards: readonly Card[], suit: number) => {
  let mask = 0;

  for (const card of cards) {
    if (CARD_SUITS[card] === suit) {
      mask += BINARY[CARD_RANKS[card] ?? 0] ?? 0;
    }
  }

  return FLUSH_TABLE[mask] ?? LOWEST_HAND;
};

export const evaluate = (cards: readonly Card[]) => {
  let rankKey = 0;
  let suitKey = 0;

  for (const card of cards) {
    rankKey += QUINARY[CARD_RANKS[card] ?? 0] ?? 0;
    suitKey += OCTAL[CARD_SUITS[card] ?? 0] ?? 0;
  }

  const flushSuit = FLUSH_SUIT[suitKey] ?? -1;

  return flushSuit >= 0
    ? lookupFlush(cards, flushSuit)
    : lookupWithoutFlush(rankKey);
};

export const handCategory = (rank: HandRank): HandCategory => {
  const category = Math.floor(rank / CATEGORY_SCALE);
  const top = Math.floor(rank / RANKS ** (KICKER_DIGITS - 1)) % RANKS;

  if (category === STRAIGHT_FLUSH && top === ACE) {
    return "RoyalFlush";
  }

  return CATEGORY_NAMES[category] ?? "HighCard";
};

export const describe = (rank: HandRank) => {
  const category = Math.floor(rank / CATEGORY_SCALE);

  const ranks = Array.from(
    { length: KICKER_DIGITS },
    (_, digit) =>
      Math.floor(rank / RANKS ** (KICKER_DIGITS - 1 - digit)) % RANKS
  ).slice(0, SIGNIFICANT_RANKS[category] ?? 0);

  return { category: handCategory(rank), ranks };
};
