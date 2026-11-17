import { codeFor } from "@nostakes/avatar";

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

export const BAD_BEAT: MomentPicture = {
  blinds: 106,
  boards: [[...BOARD]],
  flag: { board: 1, card: "Kh", word: "River" },
  foot: "",
  hand: 31,
  kicker: "BAD BEAT",
  kind: "BadBeat",
  lifted: ["Kh", "9s", "7h"],
  line: `Jonas was ${FAVOURITE_PERCENT}% to win when the chips went in. Then the river came.`,
  meta: "Hand 31 · 10/20 hold'em",
  painful: true,
  pot: POT,
  seats: [
    {
      avatar: codeFor(CAST.Priya),
      backs: 0,
      cards: [...HANDS.Priya],
      expression: "Happy",
      hand: "Three kings",
      name: "Priya",
      note: "got there on the river",
      playing: [...HANDS.Priya],
      swing: 1060,
      won: true,
    },
    {
      avatar: codeFor(CAST.Jonas),
      backs: 0,
      cards: [...HANDS.Jonas],
      expression: "Gutted",
      hand: "A pair of aces",
      name: "Jonas",
      note: `was ${FAVOURITE_PERCENT}% to win`,
      playing: [],
      swing: -1060,
      won: false,
    },
  ],
  tier: TIER,
  title: "Aces cracked",
  verb: "RIVERS",
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
