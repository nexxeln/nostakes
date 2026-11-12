import type { Card } from "@nostakes/engine";

import type { ClosedView } from "../src/features/room.js";

const HOLE_CARDS = 2;

const BOARD_CARDS = 5;

const taken = (
  cards: readonly Card[],
  most: number,
  held: ReadonlySet<Card>
): readonly Card[] =>
  [...new Set(cards)].filter((card) => !held.has(card)).slice(0, most);

type Recapped = ClosedView["recap"]["moments"][number];

const dealable = (recapped: Recapped): Recapped => {
  const inHands = new Set<Card>();

  const players = recapped.players.map((player) => {
    const shown = taken(player.shown, HOLE_CARDS, inHands);

    for (const card of shown) {
      inHands.add(card);
    }

    return { ...player, shown };
  });

  return {
    ...recapped,
    boards: recapped.boards.map((board) => taken(board, BOARD_CARDS, inHands)),
    players,
  };
};

export const withHandsADeckCanDeal = (view: ClosedView): ClosedView => ({
  ...view,
  recap: { ...view.recap, moments: view.recap.moments.map(dealable) },
});
