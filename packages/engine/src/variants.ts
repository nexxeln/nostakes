import { Schema } from "effect";

import type { Card } from "./cards.js";
import { evaluate, evaluateJoined } from "./evaluation.js";
import type { HandRank } from "./evaluation.js";

export const GameSchema = Schema.Literals(["Holdem", "Omaha"]);

export type Game = typeof GameSchema.Type;

export const HOLDEM: Game = "Holdem";

export const HAND_SIZE = 5;

export interface CardsFromHole {
  readonly least: number;
  readonly most: number;
}

export interface Variant {
  readonly evaluationCost: number;
  readonly holeCards: number;
  readonly playsFromHole: CardsFromHole;
}

export const VARIANTS: Readonly<Record<Game, Variant>> = {
  Holdem: {
    evaluationCost: 1,
    holeCards: 2,
    playsFromHole: { least: 0, most: 2 },
  },
  Omaha: {
    evaluationCost: 10,
    holeCards: 4,
    playsFromHole: { least: 2, most: 2 },
  },
};

export const MOST_HOLE_CARDS = Math.max(
  ...Object.values(VARIANTS).map((variant) => variant.holeCards)
);

export const variantOf = (game: Game): Variant => VARIANTS[game];

const choose = <A>(
  items: readonly A[],
  count: number
): readonly (readonly A[])[] => {
  if (count === 0) {
    return [[]];
  }

  return items.flatMap((item, index) =>
    choose(items.slice(index + 1), count - 1).map((rest) => [item, ...rest])
  );
};

const playsAnyCards = (variant: Variant, hole: readonly Card[]) =>
  variant.playsFromHole.least === 0 &&
  variant.playsFromHole.most >= hole.length;

const holeCounts = (variant: Variant, hole: readonly Card[], board: number) =>
  Array.from(
    {
      length: variant.playsFromHole.most - variant.playsFromHole.least + 1,
    },
    (_, step) => variant.playsFromHole.least + step
  ).filter((count) => count <= hole.length && HAND_SIZE - count <= board);

export const handsMadeFrom = (
  game: Game,
  hole: readonly Card[],
  board: readonly Card[]
): readonly (readonly Card[])[] => {
  const variant = variantOf(game);
  const all = [...hole, ...board];

  if (playsAnyCards(variant, hole)) {
    return all.length <= HAND_SIZE ? [all] : choose(all, HAND_SIZE);
  }

  return holeCounts(variant, hole, board.length).flatMap((count) =>
    choose(hole, count).flatMap((fromTheHole) =>
      choose(board, HAND_SIZE - count).map((fromTheBoard) => [
        ...fromTheHole,
        ...fromTheBoard,
      ])
    )
  );
};

const boardPicks = (board: number, count: number) =>
  choose(
    Array.from({ length: board }, (_, index) => index),
    count
  );

export const handRanker = (
  game: Game,
  hole: readonly Card[]
): ((board: readonly Card[]) => HandRank) => {
  const variant = variantOf(game);

  if (playsAnyCards(variant, hole)) {
    const buffer: Card[] = [...hole];

    return (board) => {
      buffer.length = hole.length;
      buffer.push(...board);

      return evaluate(buffer);
    };
  }

  const fromHole = new Map(
    holeCounts(variant, hole, HAND_SIZE).map((count) => [
      count,
      choose(hole, count),
    ])
  );

  const picked: Card[] = [];
  const picksByBoard = new Map<number, readonly (readonly number[])[]>();

  const picksFor = (board: number, count: number) => {
    const key = board * HAND_SIZE + count;
    const known = picksByBoard.get(key);

    if (known !== undefined) {
      return known;
    }

    const picks = boardPicks(board, HAND_SIZE - count);

    picksByBoard.set(key, picks);

    return picks;
  };

  return (board) => {
    let best: HandRank | undefined;

    for (const [count, holes] of fromHole) {
      if (HAND_SIZE - count > board.length) {
        continue;
      }

      for (const pick of picksFor(board.length, count)) {
        picked.length = 0;

        for (const index of pick) {
          const card = board[index];

          if (card !== undefined) {
            picked.push(card);
          }
        }

        for (const fromTheHole of holes) {
          const rank = evaluateJoined(fromTheHole, picked);

          if (best === undefined || rank > best) {
            best = rank;
          }
        }
      }
    }

    return best ?? evaluate([...hole, ...board]);
  };
};

export const rankHand = (
  game: Game,
  hole: readonly Card[],
  board: readonly Card[]
): HandRank => handRanker(game, hole)(board);

export const rankBoard = (board: readonly Card[]): HandRank => evaluate(board);

export const bestHand = (
  game: Game,
  hole: readonly Card[],
  board: readonly Card[]
): readonly Card[] => {
  const target = rankHand(game, hole, board);

  return (
    handsMadeFrom(game, hole, board).find(
      (five) => evaluate(five) === target
    ) ?? [...hole, ...board]
  );
};
