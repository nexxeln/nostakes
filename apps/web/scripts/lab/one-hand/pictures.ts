import { codeFor } from "@nostakes/avatar";
import { CardFromText } from "@nostakes/engine";
import { equities, percentOf } from "@nostakes/room";
import { Schema } from "effect";

import { CAST } from "../../../src/features/landing/cast.js";
import { CAPTIONS } from "../../../src/features/moments/captions.js";
import { pictureSvg } from "../../../src/features/moments/picture.js";
import type { MomentPicture } from "../../../src/features/moments/schema.js";
import { FAMILIES } from "../../../src/features/moments/score.js";
import {
  cardPose,
  partPose,
  planFor,
} from "../../../src/features/moments/timeline.js";
import type { Pose as PartPose } from "../../../src/features/moments/timeline.js";
import { settleUpSvg } from "../../../src/features/pictures/settle-up.js";
import type { SettleUpCard } from "../../../src/features/pictures/settle-up.js";
import { themed } from "./art.js";
import type { Inks } from "./art.js";

export const HANDS = {
  Jonas: ["Ah", "As"],
  Priya: ["Kd", "Kc"],
} as const;

export const BOARD = ["2c", "7h", "9s", "3d", "Kh"] as const;

export const POT = 2120;

const cards = Schema.decodeSync(Schema.Array(CardFromText));

const TURN = 4;

const oddsOnTheTurn = equities(
  [cards(HANDS.Jonas), cards(HANDS.Priya)],
  cards(BOARD.slice(0, TURN))
);

export const CHANCES = {
  Jonas: percentOf(oddsOnTheTurn, 0),
  Priya: percentOf(oddsOnTheTurn, 1),
};

const TIER = 3;

const caption = CAPTIONS.BadBeat[TIER]?.({
  against: "Priya",
  bet: 0,
  category: "OnePair",
  hand: "",
  other: "",
  percent: CHANCES.Jonas,
  runs: 1,
  start: "",
  who: "Jonas",
}) ?? { line: "", title: "Bad beat" };

export const MOMENT: MomentPicture = {
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

const WIDTH = 1080;

const HEIGHT = 1350;

const look = (theme: "Dark" | "Light") =>
  ({ deck: "TwoColour", fonts: "", frame: "Table", theme }) as const;

const drawn = (inks: Inks, draw: (theme: "Dark" | "Light") => string) =>
  themed(inks, draw("Light"), draw("Dark"));

const OPEN = /^<svg [^>]*>/u;

const bodyOf = (svg: string) => svg.replace(OPEN, "").replace(/<\/svg>$/u, "");

export const settleUpArt = (inks: Inks) =>
  `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">${bodyOf(drawn(inks, (theme) => settleUpSvg(SETTLE_UP, look(theme))))}</svg>`;

const PART_OPEN =
  /<(?<tag>g|text) class="part" data-part="(?<role>[a-z]+)" data-index="(?<index>\d+)"/u;

interface Layer {
  readonly art: string;
  readonly index: number;
  readonly role: string;
}

const closeOf = (text: string, from: number, tag: string) => {
  const opening = new RegExp(`<${tag}[\\s>]`, "gu");
  const closing = `</${tag}>`;

  const walk = (at: number, depth: number): number => {
    const close = text.indexOf(closing, at);

    opening.lastIndex = at;

    const open = opening.exec(text);

    if (close === -1) {
      return text.length;
    }

    if (open !== null && open.index < close) {
      return walk(open.index + 1, depth + 1);
    }

    return depth === 0 ? close + closing.length : walk(close + 1, depth - 1);
  };

  return walk(from + 1, 0);
};

const layersOf = (body: string): readonly Layer[] => {
  const layers: Layer[] = [];

  const scan = (rest: string, still: string) => {
    const found = PART_OPEN.exec(rest);

    if (found === null) {
      layers.push({ art: `${still}${rest}`, index: layers.length, role: "" });

      return;
    }

    const { index = "0", role = "", tag = "g" } = found.groups ?? {};
    const end = closeOf(rest, found.index, tag);
    const before = `${still}${rest.slice(0, found.index)}`;

    if (before.replaceAll(/<\/?g[^>]*>/gu, "").trim() !== "") {
      layers.push({ art: before, index: layers.length, role: "" });
    }

    layers.push({
      art: rest.slice(found.index, end),
      index: Number(index),
      role,
    });
    scan(rest.slice(end), "");
  };

  scan(body, "");

  return layers;
};

const POT_BOX = { height: 96, width: 150 + String(POT).length * 34 + 34 };

const ORIGINS = new Map([
  [
    "pot",
    `${((90 + POT_BOX.width / 2) / WIDTH) * 100}% ${((1190 + POT_BOX.height / 2) / HEIGHT) * 100}%`,
  ],
]);

const WRAP = /^<g transform="translate\(0 0\)">|<\/g>$/gu;

export const momentPartOf = (role: string, index: number) =>
  `m-${role}-${index}`;

export const momentArt = (inks: Inks) => {
  const body = bodyOf(
    drawn(inks, (theme) => pictureSvg(MOMENT, look(theme)))
  ).replaceAll(WRAP, "");

  return layersOf(body)
    .filter(({ art }) => art.trim() !== "")
    .map(({ art, index, role }) => {
      const origin = ORIGINS.get(role);

      const style =
        origin === undefined ? "" : ` style="transform-origin:${origin}"`;

      const part = role === "" ? "" : ` data-p="${momentPartOf(role, index)}"`;

      return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true"${part}${style}>${art}</svg>`;
    })
    .join("");
};

const FAMILY = FAMILIES[MOMENT.kind];

const ENTRY_MS = 1500;

const STEP_MS = 100;

const SAMPLES = Array.from(
  { length: Math.floor(ENTRY_MS / STEP_MS) + 1 },
  (_, index) => index * STEP_MS
);

const number = (value: number, digits: number) =>
  String(Number(value.toFixed(digits)));

const framed = (pose: PartPose) =>
  `transform:translate(${number((pose.dx / WIDTH) * 100, 2)}%,${number((pose.dy / HEIGHT) * 100, 2)}%) rotate(${number(pose.turn, 2)}deg) scale(${number(pose.scale * pose.squeeze, 3)},${number(pose.scale, 3)});opacity:${number(pose.opacity, 3)}`;

export interface Staged {
  readonly frames: readonly { readonly at: number; readonly css: string }[];
  readonly part: string;
}

const PARTS = /data-p="m-(?<role>[a-z]+)-(?<index>\d+)"/gu;

export const momentStaging = (art: string): readonly Staged[] =>
  [...art.matchAll(PARTS)].map((found) => {
    const { index = "0", role = "" } = found.groups ?? {};

    return {
      frames: SAMPLES.map((ms) => ({
        at: ms / ENTRY_MS,
        css: framed(partPose(role, Number(index), ms, FAMILY, TIER)),
      })),
      part: momentPartOf(role, Number(index)),
    };
  });

export const momentCardFrames = () => {
  const plan = planFor(FAMILY, TIER);

  return SAMPLES.map((ms) => ({
    at: ms / ENTRY_MS,
    css: framed(cardPose(FAMILY, ms, plan)),
  }));
};
