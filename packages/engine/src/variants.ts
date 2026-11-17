import { Schema } from "effect";

import type { Card } from "./cards.js";
import { evaluate } from "./evaluation.js";
import type { HandRank } from "./evaluation.js";

export const GameSchema = Schema.Literals(["Holdem"]);

export type Game = typeof GameSchema.Type;

export const HOLDEM: Game = "Holdem";

export const HAND_SIZE = 5;

export interface CardsFromHole {
  readonly least: number;
  readonly most: number;
}

export interface Variant {
  readonly holeCards: number;
  readonly playsFromHole: CardsFromHole;
}

export const VARIANTS: Readonly<Record<Game, Variant>> = {
  Holdem: { holeCards: 2, playsFromHole: { least: 0, most: 2 } },
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

const usesAnyCards = (variant: Variant, hole: readonly Card[]) =>
  variant.playsFromHole.least === 0 &&
  variant.playsFromHole.most >= hole.length;

export const handsMadeFrom = (
  game: Game,
  hole: readonly Card[],
  board: readonly Card[]
): readonly (readonly Card[])[] => {
  const { playsFromHole } = variantOf(game);
  const all = [...hole, ...board];

  if (usesAnyCards(variantOf(game), hole)) {
    return all.length <= HAND_SIZE ? [all] : choose(all, HAND_SIZE);
  }

  const fromHole = Array.from(
    { length: playsFromHole.most - playsFromHole.least + 1 },
    (_, step) => playsFromHole.least + step
  ).filter(
    (count) => count <= hole.length && HAND_SIZE - count <= board.length
  );

  return fromHole.flatMap((count) =>
    choose(hole, count).flatMap((fromTheHole) =>
      choose(board, HAND_SIZE - count).map((fromTheBoard) => [
        ...fromTheHole,
        ...fromTheBoard,
      ])
    )
  );
};

export const rankHand = (
  game: Game,
  hole: readonly Card[],
  board: readonly Card[]
): HandRank => {
  if (usesAnyCards(variantOf(game), hole)) {
    return evaluate([...hole, ...board]);
  }

  let best: HandRank | undefined;

  for (const five of handsMadeFrom(game, hole, board)) {
    const rank = evaluate(five);

    if (best === undefined || rank > best) {
      best = rank;
    }
  }

  return best ?? evaluate([...hole, ...board]);
};

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
