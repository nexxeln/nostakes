import { CardSchema, DECK_SIZE, evaluate } from "@nostakes/engine";
import type { Card } from "@nostakes/engine";

export const EQUITY_BUDGET = 100_000;

export const SHARE_UNITS = 2520;

const SHARE_OF_WINNERS: readonly number[] = [
  0, 2520, 1260, 840, 630, 504, 420, 360, 315, 280,
];

const BOARD_SIZE = 5;

const MODULUS = 2_147_483_647;

const MULTIPLIER = 48_271;

const FILLER = CardSchema.make(0);

const DECK: readonly Card[] = Array.from({ length: DECK_SIZE }, (_, index) =>
  CardSchema.make(index)
);

export interface Equity {
  readonly exact: boolean;
  readonly shares: readonly number[];
  readonly total: number;
}

const boardsOf = (pool: number, missing: number) => {
  let count = 1;

  for (let taken = 0; taken < missing; taken += 1) {
    count = (count * (pool - taken)) / (taken + 1);
  }

  return count;
};

const seedOf = (cards: readonly Card[]) => {
  let seed = 1;

  for (const card of cards) {
    seed = (seed * 53 + card + 1) % (MODULUS - 1);
  }

  return seed + 1;
};

const spreadFrom = (seed: number) => {
  let state = seed;

  return (bound: number) => {
    state = (state * MULTIPLIER) % MODULUS;

    return Math.floor((state * bound) / MODULUS);
  };
};

interface Scorer {
  readonly score: (extra: readonly Card[]) => void;
  readonly shares: number[];
}

const scorer = (
  hands: readonly (readonly Card[])[],
  board: readonly Card[],
  missing: number
): Scorer => {
  const buffers = hands.map((hand) => [
    ...hand,
    ...board,
    ...Array.from({ length: missing }, () => FILLER),
  ]);

  const offsets = hands.map((hand) => hand.length + board.length);
  const ranks = hands.map(() => 0);
  const shares = hands.map(() => 0);

  const score = (extra: readonly Card[]) => {
    let best = -1;
    let winners = 0;

    for (let index = 0; index < buffers.length; index += 1) {
      const buffer = buffers[index] ?? [];
      const offset = offsets[index] ?? 0;

      for (let place = 0; place < missing; place += 1) {
        const card = extra[place];

        if (card !== undefined) {
          buffer[offset + place] = card;
        }
      }

      const rank = evaluate(buffer);

      ranks[index] = rank;

      if (rank > best) {
        best = rank;
        winners = 1;
      } else if (rank === best) {
        winners += 1;
      }
    }

    const share = SHARE_OF_WINNERS[winners] ?? 0;

    for (let index = 0; index < ranks.length; index += 1) {
      if (ranks[index] === best) {
        shares[index] = (shares[index] ?? 0) + share;
      }
    }
  };

  return { score, shares };
};

const enumerate = (
  pool: readonly Card[],
  missing: number,
  score: (extra: readonly Card[]) => void
) => {
  const picked: Card[] = [];

  const walk = (from: number) => {
    if (picked.length === missing) {
      score(picked);

      return;
    }

    const last = pool.length - (missing - picked.length);

    for (let index = from; index <= last; index += 1) {
      const card = pool[index];

      if (card !== undefined) {
        picked.push(card);
        walk(index + 1);
        picked.pop();
      }
    }
  };

  walk(0);
};

const sample = (
  pool: readonly Card[],
  missing: number,
  boards: number,
  seed: number,
  score: (extra: readonly Card[]) => void
) => {
  const below = spreadFrom(seed);
  const deck = [...pool];

  for (let board = 0; board < boards; board += 1) {
    for (let place = 0; place < missing; place += 1) {
      const other = place + below(deck.length - place);
      const held = deck[place];
      const chosen = deck[other];

      if (held !== undefined && chosen !== undefined) {
        deck[place] = chosen;
        deck[other] = held;
      }
    }

    score(deck);
  }
};

export const equities = (
  hands: readonly (readonly Card[])[],
  board: readonly Card[],
  budget: number = EQUITY_BUDGET
): Equity => {
  const known = new Set([...hands.flat(), ...board]);
  const pool = DECK.filter((card) => !known.has(card));

  const missing = Math.max(0, BOARD_SIZE - board.length);
  const every = boardsOf(pool.length, missing);
  const { score, shares } = scorer(hands, board, missing);
  const exact = every * Math.max(1, hands.length) <= budget;

  const boards = exact
    ? every
    : Math.max(1, Math.floor(budget / Math.max(1, hands.length)));

  if (exact) {
    enumerate(pool, missing, score);
  } else {
    sample(pool, missing, boards, seedOf([...hands.flat(), ...board]), score);
  }

  return { exact, shares, total: boards * SHARE_UNITS };
};

export const percentOf = (equity: Equity, index: number) => {
  const share = equity.shares[index] ?? 0;

  return Math.floor((share * 200 + equity.total) / (equity.total * 2));
};

export const atLeast = (equity: Equity, index: number, percent: number) =>
  (equity.shares[index] ?? 0) * 100 >= percent * equity.total;

export const atMost = (equity: Equity, index: number, percent: number) =>
  (equity.shares[index] ?? 0) * 100 <= percent * equity.total;
