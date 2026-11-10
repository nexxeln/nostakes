import { cardText } from "@nostakes/engine";
import type { Card } from "@nostakes/engine";

const SUITS = new Map([
  ["c", { name: "clubs", red: false, symbol: "♣" }],
  ["d", { name: "diamonds", red: true, symbol: "♦" }],
  ["h", { name: "hearts", red: true, symbol: "♥" }],
  ["s", { name: "spades", red: false, symbol: "♠" }],
]);

const RANKS = new Map([["T", "10"]]);

export const cardLabel = (card: Card) => {
  const text = cardText(card);
  const rank = RANKS.get(text.charAt(0)) ?? text.charAt(0);
  const suit = SUITS.get(text.charAt(1));

  return `${rank}${suit?.symbol ?? ""}`;
};
