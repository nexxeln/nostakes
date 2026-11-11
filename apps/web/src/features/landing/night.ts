import { codeFor } from "@nostakes/avatar";

import { CAPTIONS } from "../moments/captions.js";
import type { CaptionFacts } from "../moments/captions.js";
import type { MomentPicture } from "../moments/schema.js";
import type { SettleUpCard } from "../pictures/settle-up.js";
import { CAST } from "./cast.js";

const FACTS: CaptionFacts = {
  against: "",
  bet: 0,
  category: "HighCard",
  hand: "",
  other: "",
  percent: 81,
  runs: 1,
  start: "",
  who: "Jonas",
};

const caption = CAPTIONS.BadBeat[1]?.(FACTS) ?? {
  line: "Jonas was 81% to win.",
  title: "Bad beat",
};

export const BAD_BEAT: MomentPicture = {
  also: "",
  boards: [["2c", "7h", "9s", "Kh", "3d"]],
  faces: [
    {
      avatar: codeFor(CAST.Jonas),
      cards: ["Ah", "As"],
      expression: "Gutted",
      name: "Jonas",
      won: false,
    },
    {
      avatar: codeFor(CAST.Priya),
      cards: ["Kd", "Kc"],
      expression: "Happy",
      name: "Priya",
      won: true,
    },
  ],
  kind: "BadBeat",
  lifted: ["Kd", "Kc", "Kh", "9s", "7h"],
  line: caption.line,
  painful: true,
  pot: 2000,
  tier: 1,
  title: caption.title,
};

export const SETTLE_UP: SettleUpCard = {
  players: [
    {
      avatar: codeFor(CAST.Priya),
      expression: "Happy",
      name: "Priya",
      net: 1250,
    },
    { avatar: codeFor(CAST.Maya), expression: "Happy", name: "Maya", net: 310 },
    { avatar: codeFor(CAST.Lou), expression: "Resting", name: "Lou", net: 0 },
    {
      avatar: codeFor(CAST.Dev),
      expression: "Resting",
      name: "Dev",
      net: -160,
    },
    {
      avatar: codeFor(CAST.Sam),
      expression: "Resting",
      name: "Sam",
      net: -400,
    },
    {
      avatar: codeFor(CAST.Jonas),
      expression: "Gutted",
      name: "Jonas",
      net: -1000,
    },
  ],
  transfers: [
    { amount: 1000, from: "Jonas", to: "Priya" },
    { amount: 250, from: "Sam", to: "Priya" },
    { amount: 150, from: "Sam", to: "Maya" },
    { amount: 160, from: "Dev", to: "Maya" },
  ],
};
