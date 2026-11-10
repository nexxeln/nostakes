import { cardText } from "@nostakes/engine";
import type { Card } from "@nostakes/engine";
import type { Html, HtmlBuilder } from "foldkit/html";

import type { Message } from "./message.js";

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

export const cardView = (
  card: Card,
  h: HtmlBuilder<Message>,
  size = ""
): Html => {
  const text = cardText(card);
  const rank = RANKS.get(text.charAt(0)) ?? text.charAt(0);
  const suit = SUITS.get(text.charAt(1));

  return h.span(
    [
      h.Key(`card-${card}`),
      h.Class(`card ${suit?.red === true ? "is-red" : ""} ${size}`),
      h.AriaLabel(`${rank} of ${suit?.name ?? ""}`),
    ],
    [
      h.span([h.Class("card-rank")], [rank]),
      h.span([h.Class("card-suit")], [suit?.symbol ?? ""]),
    ]
  );
};

export const cardBack = (
  h: HtmlBuilder<Message>,
  key: string,
  size = ""
): Html =>
  h.span(
    [
      h.Key(key),
      h.Class(`card is-back ${size}`),
      h.AriaLabel("face-down card"),
    ],
    []
  );

export const cardSlot = (h: HtmlBuilder<Message>, key: string): Html =>
  h.span([h.Key(key), h.Class("card is-slot")], []);
