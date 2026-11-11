import type { HandCategory } from "@nostakes/engine";
import type { MomentKind, Tier } from "@nostakes/room";

import { capitalised } from "./hand-names.js";

export interface CaptionFacts {
  readonly against: string;
  readonly bet: number;
  readonly category: HandCategory;
  readonly hand: string;
  readonly other: string;
  readonly percent: number;
  readonly runs: number;
  readonly start: string;
  readonly who: string;
}

export interface Caption {
  readonly line: string;
  readonly title: string;
}

type Captions = (facts: CaptionFacts) => Caption;

export const chipsText = (amount: number) =>
  Math.trunc(amount).toLocaleString("en-US");

const RUN_WORDS = ["", "once", "twice", "three times"];

const runsWord = (runs: number) => RUN_WORDS[runs] ?? `${runs} times`;

const bigHand = (facts: CaptionFacts): Caption => {
  const named: Partial<Record<HandCategory, Caption>> = {
    Flush: {
      line: `${facts.who} had the best flush there was.`,
      title: "Nut flush",
    },
    FourOfAKind: {
      line: `${capitalised(facts.hand)} for ${facts.who}.`,
      title: "Quads",
    },
    FullHouse: {
      line: `${facts.who} filled up: ${facts.hand}.`,
      title: "Full house",
    },
    RoyalFlush: {
      line: `${facts.who} made a royal. Screenshot this.`,
      title: "Royal flush",
    },
    StraightFlush: {
      line: `${capitalised(facts.hand)}. Screenshot this.`,
      title: "Straight flush",
    },
  };

  return (
    named[facts.category] ?? {
      line: `${facts.who} with ${facts.hand}.`,
      title: capitalised(facts.hand),
    }
  );
};

const beatLine = (facts: CaptionFacts, ending: string) =>
  facts.percent >= 80
    ? `${facts.who} was ${facts.percent}% to win${ending}`
    : `${facts.who} lost with ${facts.hand}.`;

const coolerLine = (facts: CaptionFacts) =>
  `${capitalised(facts.who)}'s ${facts.hand} ran into ${facts.other}.`;

export const CAPTIONS: Readonly<
  Record<MomentKind, Readonly<Partial<Record<Tier, Captions>>>>
> = {
  BadBeat: {
    1: (facts) => ({ line: beatLine(facts, "."), title: "Bad beat" }),
    2: (facts) => ({
      line: beatLine(facts, " and still lost."),
      title: "Brutal beat",
    }),
    3: (facts) => ({
      line: beatLine(facts, ", until it wasn't."),
      title: "The cruellest card",
    }),
  },
  BigHand: { 1: bigHand, 2: bigHand, 3: bigHand },
  Bluff: {
    1: (facts) => ({
      line: `${facts.who} took it down with ${facts.start}.`,
      title: "Bluff",
    }),
    2: (facts) => ({
      line: `${chipsText(facts.bet)} on ${facts.start}. Nobody called.`,
      title: "Stone-cold bluff",
    }),
  },
  Cooler: {
    1: (facts) => ({ line: coolerLine(facts), title: "Cooler" }),
    2: (facts) => ({ line: coolerLine(facts), title: "Cooler" }),
    3: (facts) => ({
      line: `${capitalised(facts.hand)}, and still second best.`,
      title: "Ice cold",
    }),
  },
  HeroCall: {
    1: (facts) => ({
      line: `${facts.who} called with ${facts.start} and was right.`,
      title: "Hero call",
    }),
    2: (facts) => ({
      line: `${facts.who} called ${chipsText(facts.bet)} with ${facts.start}.`,
      title: "Sheriff",
    }),
  },
  SameHand: {
    1: (facts) => ({
      line: `${facts.who} and ${facts.against} both had ${facts.start}.`,
      title: "Same hand",
    }),
  },
  SevenDeuce: {
    1: (facts) => ({
      line:
        facts.bet > 0
          ? `${facts.who} won with the worst hand in poker. The table paid ${chipsText(facts.bet)}.`
          : `The worst hand in poker, and ${facts.who} won with it.`,
      title: "Seven-deuce",
    }),
  },
  SplitRuns: {
    1: (facts) => ({
      line: `Ran it ${runsWord(facts.runs)}, split it.`,
      title: "One each",
    }),
  },
  Suckout: {
    1: (facts) => ({
      line: `${facts.who} had ${facts.percent}% and got there.`,
      title: "Suckout",
    }),
    2: (facts) => ({
      line: `${facts.who} was down to ${facts.percent}% and found it.`,
      title: "Miracle card",
    }),
    3: (facts) => ({
      line: `${facts.percent}% to win. ${facts.who} won.`,
      title: "Out of nowhere",
    }),
  },
};
