export interface Ranked {
  readonly cards: readonly [string, string, string, string, string];
  readonly means: string;
  readonly name: string;
}

export const RANKING: readonly Ranked[] = [
  {
    cards: ["9h", "8h", "7h", "6h", "5h"],
    means: "Five in a row, all one suit.",
    name: "Straight flush",
  },
  {
    cards: ["Qs", "Qh", "Qd", "Qc", "4s"],
    means: "All four of one rank.",
    name: "Four of a kind",
  },
  {
    cards: ["Ks", "Kh", "Kd", "6c", "6s"],
    means: "Three of one rank and two of another.",
    name: "Full house",
  },
  {
    cards: ["Ah", "Jh", "8h", "5h", "2h"],
    means: "Five of one suit.",
    name: "Flush",
  },
  {
    cards: ["9s", "8d", "7h", "6c", "5h"],
    means: "Five in a row.",
    name: "Straight",
  },
  {
    cards: ["8s", "8h", "8d", "Kc", "3s"],
    means: "Three of one rank.",
    name: "Three of a kind",
  },
  {
    cards: ["Js", "Jd", "4h", "4c", "As"],
    means: "Two different pairs.",
    name: "Two pair",
  },
  {
    cards: ["Ts", "Th", "Ad", "7c", "4s"],
    means: "Two of one rank.",
    name: "One pair",
  },
  {
    cards: ["As", "Jd", "8h", "6c", "3s"],
    means: "Nothing matches. The highest card plays.",
    name: "High card",
  },
];

export const HABITS: readonly string[] = [
  "Fold most hands. Play pairs and big cards.",
  "Got a good hand? Bet it. Calling along bleeds chips.",
  "One card short? A cheap look is fine. An expensive one is not.",
  "A big bet on the river usually means it.",
];

export const MANNERS =
  "Act when it is your turn, and keep your cards to yourself until the hand is over.";

export const SHARE = {
  text: "Five short hands and you can sit at a friend's poker night.",
  title: "How to play poker in two minutes",
};
