import { bestHand, HAND_SIZE, variantOf } from "@nostakes/engine";
import type { Card, Game } from "@nostakes/engine";

const sameCards = (one: readonly Card[], other: readonly Card[]) =>
  one.length === other.length && one.every((card) => other.includes(card));

export const playingCards = (
  game: Game,
  hole: readonly Card[],
  boards: readonly (readonly Card[])[]
): readonly Card[] => {
  const { holeCards, playsFromHole } = variantOf(game);

  const choosesFromTheHole =
    playsFromHole.least === playsFromHole.most &&
    playsFromHole.most < holeCards;

  if (
    !choosesFromTheHole ||
    hole.length !== holeCards ||
    boards.length === 0 ||
    boards.some((board) => board.length !== HAND_SIZE)
  ) {
    return [];
  }

  const [first = [], ...rest] = boards.map((board) => {
    const made = bestHand(game, hole, board);

    return hole.filter((card) => made.includes(card));
  });

  return rest.every((played) => sameCards(played, first)) ? first : [];
};
