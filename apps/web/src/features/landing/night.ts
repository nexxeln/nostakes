import { codeFor } from "@nostakes/avatar";

import { CAPTIONS } from "../moments/captions.js";
import type { MomentPicture } from "../moments/schema.js";
import type { SettleUpCard } from "../pictures/settle-up.js";
import { CAST } from "./cast.js";

export const HANDS = {
  Jonas: ["Ah", "As"],
  Priya: ["Kd", "Kc"],
} as const;

export const BOARD = ["2c", "7h", "9s", "3d", "Kh"] as const;

export const MONEY_WENT_IN_AFTER = 4;

export const FAVOURITE_PERCENT = 95;

export const POT = 2120;

const TIER = 3;

const caption = CAPTIONS.BadBeat[TIER]?.({
  against: "Priya",
  bet: 0,
  category: "OnePair",
  hand: "",
  other: "",
  percent: FAVOURITE_PERCENT,
  runs: 1,
  start: "",
  who: "Jonas",
}) ?? { line: "", title: "Bad beat" };

export const BAD_BEAT: MomentPicture = {
  also: "",
  boards: [[...BOARD]],
  faces: [
    {
      avatar: codeFor(CAST.Jonas),
      cards: [...HANDS.Jonas],
      expression: "Gutted",
      name: "Jonas",
      won: false,
    },
    {
      avatar: codeFor(CAST.Priya),
      cards: [...HANDS.Priya],
      expression: "Happy",
      name: "Priya",
      won: true,
    },
  ],
  kind: "BadBeat",
  lifted: ["Kd", "Kc", "Kh", "9s", "7h"],
  line: caption.line,
  painful: true,
  pot: POT,
  tier: TIER,
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
