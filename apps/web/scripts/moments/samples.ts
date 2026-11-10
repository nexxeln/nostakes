import { codeFor, randomAvatar } from "@nostakes/avatar";
import type { Expression } from "@nostakes/avatar";
import { CardFromText, evaluate } from "@nostakes/engine";
import type { MomentKind, Tier } from "@nostakes/room";
import { Schema } from "effect";

import { CAPTIONS } from "../../src/features/moments/captions.js";
import type { CaptionFacts } from "../../src/features/moments/captions.js";
import { bestFive, handName } from "../../src/features/moments/hand-names.js";
import type { MomentPicture } from "../../src/features/moments/picture.js";

const card = Schema.decodeSync(CardFromText);

const cards = (text: string) =>
  text.split(" ").filter((word) => word.length > 0);

const face = (
  name: string,
  seed: number,
  expression: Expression,
  hole: string
) => ({
  avatar: codeFor(randomAvatar(seed)),
  cards: cards(hole),
  expression,
  name,
  won: false,
});

const nameOf = (hole: string, board: string) =>
  handName(
    evaluate([...cards(hole), ...cards(board)].map((text) => card(text)))
  );

const liftedOf = (hole: string, board: string) => {
  const found = bestFive(
    cards(hole).map((text) => card(text)),
    cards(board).map((text) => card(text))
  );

  const all = [...cards(hole), ...cards(board)];

  return all.filter((text) => found.includes(card(text)));
};

const NO_FACTS: CaptionFacts = {
  against: "",
  bet: 0,
  category: "HighCard",
  hand: "",
  other: "",
  percent: 0,
  runs: 1,
  start: "",
  who: "",
};

interface Sample {
  readonly also?: string;
  readonly board: string;
  readonly boards?: readonly string[];
  readonly facts: Partial<CaptionFacts>;
  readonly faces: readonly ReturnType<typeof face>[];
  readonly kind: MomentKind;
  readonly lift: "lead" | "winner" | "none" | "hole";
  readonly pot: number;
  readonly tier: Tier;
}

const SAMPLES = {
  "BadBeat-1": {
    board: "2c 7h 9s Kh 3d",
    faces: [
      face("Jonas", 41, "Gutted", "Ah As"),
      face("Priya", 23, "Happy", "Kd Kc"),
    ],
    facts: { percent: 81, who: "Jonas" },
    kind: "BadBeat",
    lift: "winner",
    pot: 2000,
    tier: 1,
  },
  "BigHand-1": {
    board: "9h 7h 2c Jh 5s",
    faces: [face("Lou", 5, "Happy", "Ah 4h")],
    facts: { category: "Flush", who: "Lou" },
    kind: "BigHand",
    lift: "lead",
    pot: 620,
    tier: 1,
  },
  "BigHand-2": {
    board: "9c 9d 2s Kd 4c",
    faces: [face("Maya", 11, "Happy", "9s 9h")],
    facts: { category: "FourOfAKind", who: "Maya" },
    kind: "BigHand",
    lift: "lead",
    pot: 840,
    tier: 2,
  },
  "BigHand-3": {
    board: "Qh Jh Th 2c 3d",
    faces: [face("Kit", 61, "Happy", "Ah Kh")],
    facts: { category: "RoyalFlush", who: "Kit" },
    kind: "BigHand",
    lift: "lead",
    pot: 1310,
    tier: 3,
  },
  "Bluff-2": {
    board: "Ah 2h 9c 4s Kc",
    faces: [face("Lou", 5, "Happy", "8h 7h")],
    facts: { bet: 140, start: "eight-seven", who: "Lou" },
    kind: "Bluff",
    lift: "hole",
    pot: 280,
    tier: 2,
  },
  "Cooler-2": {
    also: "Full house for Lou",
    board: "9c 7h 2s 2d 4c",
    faces: [
      face("Dev", 37, "Gutted", "7c 7d"),
      face("Lou", 5, "Happy", "9s 9h"),
    ],
    facts: { who: "Dev" },
    kind: "Cooler",
    lift: "winner",
    pot: 2000,
    tier: 2,
  },
  "HeroCall-2": {
    board: "Ah 2h 9c 4s Jc",
    faces: [
      face("Priya", 23, "Happy", "Kd Qs"),
      face("Sam", 3, "Gutted", "8h 7h"),
    ],
    facts: { bet: 140, start: "king-queen", who: "Priya" },
    kind: "HeroCall",
    lift: "hole",
    pot: 420,
    tier: 2,
  },
  "SameHand-1": {
    board: "2c 7h 9s 4d 3d",
    faces: [
      face("Jonas", 41, "Happy", "Ac Ks"),
      face("Dev", 37, "Happy", "Ah Kd"),
    ],
    facts: { against: "Dev", start: "ace-king", who: "Jonas" },
    kind: "SameHand",
    lift: "none",
    pot: 2000,
    tier: 1,
  },
  "SevenDeuce-1": {
    board: "7h 2s Kd 9c 4h",
    faces: [face("Maya", 11, "Happy", "7c 2d")],
    facts: { who: "Maya" },
    kind: "SevenDeuce",
    lift: "lead",
    pot: 260,
    tier: 1,
  },
  "SplitRuns-1": {
    board: "2c 7h 9s 4d 3c",
    boards: ["2c 7h 9s 4d 3c", "Kh 8d 5s Jc 6h"],
    faces: [
      face("Sam", 3, "Happy", "Ah As"),
      face("Kit", 61, "Happy", "Kd Kc"),
    ],
    facts: { runs: 2 },
    kind: "SplitRuns",
    lift: "none",
    pot: 1600,
    tier: 1,
  },
  "Suckout-3": {
    board: "2c 7h 9s 4d Qh",
    faces: [
      face("Kit", 61, "Happy", "Qd Qc"),
      face("Sam", 3, "Gutted", "Ah As"),
    ],
    facts: { percent: 5, who: "Kit" },
    kind: "Suckout",
    lift: "lead",
    pot: 2000,
    tier: 3,
  },
} satisfies Readonly<Record<string, Sample>>;

export const SAMPLE_NAMES = Object.keys(SAMPLES);

export const samplePicture = (name: string): MomentPicture => {
  const sample: Sample =
    new Map<string, Sample>(Object.entries(SAMPLES)).get(name) ??
    SAMPLES["BigHand-2"];

  const [lead, other] = sample.faces;
  const leadHole = lead?.cards.join(" ") ?? "";
  const otherHole = other?.cards.join(" ") ?? "";

  const winner = {
    hole: lead,
    lead,
    none: undefined,
    winner: sample.faces.find((each) => each.expression === "Happy"),
  }[sample.lift];

  const winnerHole = winner?.cards.join(" ") ?? leadHole;

  const facts: CaptionFacts = {
    ...NO_FACTS,
    hand: nameOf(leadHole, sample.board),
    other: other === undefined ? "" : nameOf(otherHole, sample.board),
    ...sample.facts,
  };

  const caption = CAPTIONS[sample.kind][sample.tier]?.(facts) ?? {
    line: "",
    title: sample.kind,
  };

  const lifted = {
    hole: cards(leadHole),
    lead: liftedOf(leadHole, sample.board),
    none: [],
    winner: liftedOf(winnerHole, sample.board),
  }[sample.lift];

  return {
    also: sample.also ?? "",
    boards: (sample.boards ?? [sample.board]).map(cards),
    faces: sample.faces.map((each) => ({ ...each, won: each === winner })),
    kind: sample.kind,
    lifted,
    line: caption.line,
    painful: sample.kind === "BadBeat" || sample.kind === "Cooler",
    pot: sample.pot,
    tier: sample.tier,
    title: caption.title,
  };
};
