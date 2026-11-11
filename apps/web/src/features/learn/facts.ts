import { NAMES } from "./cast.js";
import { SEATS } from "./lesson.js";
import type { Beat, Hand } from "./lesson.js";
import { chipsText } from "./table.js";
import type { Table } from "./table.js";

const RANK_WORDS = new Map([
  ["2", "two"],
  ["3", "three"],
  ["4", "four"],
  ["5", "five"],
  ["6", "six"],
  ["7", "seven"],
  ["8", "eight"],
  ["9", "nine"],
  ["T", "ten"],
  ["J", "jack"],
  ["Q", "queen"],
  ["K", "king"],
  ["A", "ace"],
]);

const SUIT_WORDS = new Map([
  ["c", "clubs"],
  ["d", "diamonds"],
  ["h", "hearts"],
  ["s", "spades"],
]);

export const cardWords = (card: string) =>
  `${RANK_WORDS.get(card.charAt(0)) ?? card} of ${SUIT_WORDS.get(card.charAt(1)) ?? ""}`;

const listed = (cards: readonly string[]) => cards.map(cardWords).join(", ");

export const factsOf = (hand: Hand | undefined, table: Table, beat: Beat) => {
  if (hand === undefined || beat.kind === "Recap") {
    return "";
  }

  const board = hand.board.slice(0, table.board);

  const chips =
    table.pot + SEATS.reduce((sum, seat) => sum + table.bets[seat], 0);

  return [
    beat.peeked ? `Your cards: ${listed(hand.hole.you)}.` : "",
    board.length > 0 ? `On the table: ${listed(board)}.` : "",
    chips > 0 ? `In the pot: ${chipsText(chips)}.` : "",
    ...SEATS.flatMap((seat) =>
      seat !== "you" && table.said[seat].length > 0
        ? [`${NAMES[seat]}: ${table.said[seat]}.`]
        : []
    ),
    ...table.shown.flatMap((seat) =>
      seat === "you" ? [] : [`${NAMES[seat]} shows ${listed(hand.hole[seat])}.`]
    ),
    table.won === undefined
      ? ""
      : `${NAMES[table.won.seat]} ${table.won.seat === "you" ? "win" : "wins"} ${chipsText(table.won.amount)}.`,
  ]
    .filter((sentence) => sentence.length > 0)
    .join(" ");
};
