import { Events, evaluate } from "../src/index.js";
import type { Card, Event, Game } from "../src/index.js";

const omahaRank = (hole: readonly Card[], board: readonly Card[]) => {
  let best = -1;

  for (const [first, firstCard] of hole.entries()) {
    for (const secondCard of hole.slice(first + 1)) {
      for (const [one, oneCard] of board.entries()) {
        for (const [two, twoCard] of board.slice(one + 1).entries()) {
          for (const threeCard of board.slice(one + two + 2)) {
            best = Math.max(
              best,
              evaluate([firstCard, secondCard, oneCard, twoCard, threeCard])
            );
          }
        }
      }
    }
  }

  return best;
};

export const oracleRank = (
  game: Game,
  hole: readonly Card[],
  board: readonly Card[]
) =>
  game === "Omaha" ? omahaRank(hole, board) : evaluate([...hole, ...board]);

export const gameOfHand = (hand: readonly Event[]): Game =>
  hand.find(Events.$is("HandStarted"))?.game ?? "Holdem";
