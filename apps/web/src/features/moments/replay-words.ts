import { rankOf, suitOf } from "@nostakes/engine";
import type { Card } from "@nostakes/engine";

import { isolated } from "../names.js";
import { fitted } from "../pictures/text-fit.js";
import { chipsText } from "./captions.js";
import { capitalised, rankWord, ranksWord } from "./hand-names.js";

const NAME_ROOM_EMS = 7.6;

export const shortName = (name: string) => fitted(name, 1, NAME_ROOM_EMS).text;

const who = (name: string) => isolated(shortName(name));

const RUN_WORDS = ["", "once", "twice", "three times"];

const ORDINALS = ["First", "Second", "Third"];

const COUNTS = [
  "None",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];

const SUITS = ["club", "diamond", "heart", "spade"];

const article = (word: string) => (/^[ae]/u.test(word) ? "an" : "a");

const a = (word: string) => `${article(word)} ${word}`;

const countWord = (count: number) => COUNTS[count] ?? String(count);

const neededCards = (
  cards: readonly Card[],
  unseenOfRank: (rank: number) => number
) => {
  const ranks = [...new Set(cards.map((card) => rankOf(card)))];
  const suits = [...new Set(cards.map((card) => suitOf(card)))];
  const [first, second] = ranks;
  const [suit] = suits;

  if (first !== undefined && second === undefined) {
    return cards.length === 1 && unseenOfRank(first) === 1
      ? `the last ${rankWord(first)}`
      : a(rankWord(first));
  }

  if (first !== undefined && second !== undefined && ranks.length === 2) {
    return `${a(rankWord(first))} or ${a(rankWord(second))}`;
  }

  return suit !== undefined && suits.length === 1
    ? a(SUITS[suit] ?? "card")
    : "help";
};

export const REPLAY_WORDS = {
  ahead: (name: string) => `${who(name)} takes the lead.`,
  allIn: (name: string, amount: number, whole: boolean) =>
    whole
      ? `${who(name)} shoves.\nAll ${chipsText(amount)}.`
      : `${who(name)} is all in.\n${chipsText(amount)}.`,
  bet: (name: string, amount: number) =>
    `${who(name)} bets ${chipsText(amount)}.`,
  bluffs: (name: string, amount: number, allIn: boolean, hand: string) =>
    `${who(name)} ${allIn ? "shoves" : "bets"} ${chipsText(amount)}.\nWith ${hand}.`,
  board: (run: number) => `${ORDINALS[run - 1] ?? "Next"} board.`,
  boardSplit: (run: number) => `${ORDINALS[run - 1] ?? "This"} board: split.`,
  boardTo: (run: number, name: string) =>
    `${ORDINALS[run - 1] ?? "This"} board: ${who(name)}.`,
  bombPot: (ante: number) => `Bomb pot.\nEveryone antes ${chipsText(ante)}.`,
  bounty: (name: string, amount: number) =>
    `Seven-deuce bounty.\nThe table pays ${who(name)} ${chipsText(amount)}.`,
  bountyFrom: (payer: string, name: string, amount: number) =>
    `Seven-deuce bounty.\n${who(payer)} pays ${who(name)} ${chipsText(amount)}.`,
  bountyNote: (amount: number) =>
    `Bounty ${amount < 0 ? "\u2212" : "+"}${chipsText(Math.abs(amount))}`,
  call: (name: string) => `${who(name)} calls.`,
  callAhead: (name: string) => `${who(name)} calls.\nOf course.`,
  callAllIn: (name: string) => `${who(name)} calls.\nAll in.`,
  climbs: (name: string, percent: number) =>
    `${who(name)} climbs to ${percent}%.`,
  dead: (name: string) => `${who(name)} is drawing dead.`,
  fold: (name: string) => `${who(name)} folds.`,
  folds: (count: number) => `${countWord(count)} fold.`,
  hand: (hand: string) => `${capitalised(hand)}.`,
  hookHolds: (name: string, hand: string) => `${who(name)} has ${hand}.`,
  hookOdds: (name: string, percent: number) =>
    `${who(name)} is ${percent}% to win.`,
  hookSame: (name: string, other: string, hand: string) =>
    `${who(name)} has ${hand}.\nSo does ${who(other)}.`,
  hookSeen: (name: string, other: string) =>
    `You can see ${who(name)}'s cards.\n${who(other)} can't.`,
  hookSevenDeuce: (name: string) =>
    `${who(name)} has seven-deuce.\nThe worst hand in poker.`,
  lastCard: "One card to come.",
  needs: (
    name: string,
    cards: readonly Card[],
    unseenOfRank: (rank: number) => number
  ) =>
    cards.length > 12
      ? `${who(name)} has ${cards.length} outs.`
      : `${who(name)} needs ${neededCards(cards, unseenOfRank)}.\n${countWord(cards.length)} left.`,
  noIdea: (name: string, amount: number, allIn: boolean) =>
    `${who(name)} ${allIn ? "shoves" : "bets"} ${chipsText(amount)}.\nNo idea.`,
  nothing: (start: string, made: string) =>
    made.endsWith(" high")
      ? `${capitalised(start)}.\nNothing.`
      : `${capitalised(made)}.`,
  pauseCall: (name: string, lead: string) =>
    `${who(name)} can't see\n${who(lead)}'s cards.`,
  pauseCards: (name: string, count: number) =>
    count === 1
      ? `One card can beat ${who(name)}.`
      : `${countWord(count)} cards can beat ${who(name)}.`,
  pauseHero: (amount: number, hand: string) =>
    `${chipsText(amount)} to call\nwith ${hand}.`,
  pauseStill: (name: string, percent: number) =>
    `${who(name)} is still ${percent}%.`,
  raise: (name: string, amount: number) =>
    `${who(name)} makes it ${chipsText(amount)}.`,
  right: (name: string) => `${who(name)} was right.`,
  runs: (runs: number) => `They run it ${RUN_WORDS[runs] ?? `${runs} times`}.`,
  split: (amount: number) => `Split. ${chipsText(amount)} each.`,
  street: (street: "Flop" | "River" | "Turn") => `The ${street.toLowerCase()}.`,
  takes: (name: string, amount: number) =>
    `${who(name)} takes ${chipsText(amount)}.`,
  tank: (name: string) => `${who(name)} goes into\nthe time bank.`,
  tied: "Nothing left\nto separate them.",
  twoOfThem: (rank: number, count: number) =>
    count >= 3 ? `three ${ranksWord(rank)}` : `a pair of ${ranksWord(rank)}`,
} as const;
