import type { Tier } from "@nostakes/room";

import { FRAME_SIZES } from "../pictures/paper.js";
import type { KeptFrame } from "../pictures/paper.js";
import type { Key, ReplaySprite } from "./replay-plan.js";
import { STAGE, hookCaption } from "./replay-shots.js";
import type { Family } from "./score.js";
import type { Outcome, ScoreSheet } from "./sound/sheet.js";
import { partPose, REST, shortClipPose } from "./timeline.js";
import type { Pose, Staging } from "./timeline.js";

export const CLIP_FPS = 30;

export const BASE_ROLE = "base";

export interface Box {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface Layer {
  readonly band: number;
  readonly centre: { readonly x: number; readonly y: number };
  readonly cell: Box;
  readonly from: number;
  readonly index: number;
  readonly keys: readonly Key[];
  readonly role: string;
  readonly source: { readonly x: number; readonly y: number };
}

export interface Placement {
  readonly alpha: number;
  readonly at: { readonly x: number; readonly y: number };
  readonly matrix: readonly [number, number, number, number, number, number];
}

export interface Motion {
  readonly family: Family;
  readonly tier: Tier;
}

export const frameMs = (frame: number) => (frame * 1000) / CLIP_FPS;

export const TAG_STAGING: Staging = { landed: new Set(["mark"]), spread: 1 };

const UNDER_THE_REPLAY = new Set([BASE_ROLE, "felt", "mark"]);

export const tagPose = (
  part: { readonly index: number; readonly role: string },
  ms: number,
  tag: { readonly cardAt: number; readonly motion: Motion }
): Pose => {
  if (ms < tag.cardAt) {
    return UNDER_THE_REPLAY.has(part.role) ? REST : { ...REST, opacity: 0 };
  }

  return partPose(
    part.role,
    part.index,
    ms - tag.cardAt,
    tag.motion.family,
    tag.motion.tier,
    TAG_STAGING
  );
};

export const SHORT_CLIP = {
  boardMs: 1200,
  hitMs: 2300,
  lengthMs: 4500,
  pauseMs: 2000,
  resultMs: 2600,
} as const;

export const shortPose = (
  part: { readonly index: number; readonly role: string },
  ms: number
): Pose => shortClipPose(part.role, part.index, ms, SHORT_CLIP);

const HOOK_LEAVES_BEFORE_HIT = 60;

export const shortHook = (
  line: string,
  frame: KeptFrame
): readonly ReplaySprite[] => {
  const placed = hookCaption(
    line,
    (FRAME_SIZES[frame].height - STAGE.height) / 2
  );

  const leaves = SHORT_CLIP.hitMs - HOOK_LEAVES_BEFORE_HIT;

  return placed === null
    ? []
    : [
        {
          art: placed.art,
          keys: [
            { at: 0, pose: REST },
            { at: leaves - 1, pose: REST },
            { at: leaves, pose: { ...REST, opacity: 0 } },
          ],
          shownAt: 0,
        },
      ];
};

const CARD_CUES = [0, 220, 440];

const POT_AFTER_HIT = 300;

export const shortSheet = (score: {
  readonly cards: number;
  readonly outcome: Outcome;
  readonly seed: number;
}): ScoreSheet => ({
  cues: [
    ...CARD_CUES.slice(0, score.cards).map((after) => ({
      atMs: SHORT_CLIP.boardMs + after,
      kind: "Card" as const,
      pan: 0,
    })),
    { atMs: SHORT_CLIP.hitMs + POT_AFTER_HIT, kind: "Stamp", pan: 0 },
  ],
  hitMs: SHORT_CLIP.hitMs,
  lengthMs: SHORT_CLIP.lengthMs,
  outcome: score.outcome,
  pauseMs: SHORT_CLIP.pauseMs,
  resultMs: SHORT_CLIP.resultMs,
  seed: score.seed,
  tagMs: SHORT_CLIP.lengthMs,
});

const DEGREES = Math.PI / 180;

export const placementOf = (layer: Layer, pose: Pose): Placement => {
  const across = pose.scale * pose.squeeze;
  const down = pose.scale;
  const cos = Math.cos(pose.turn * DEGREES);
  const sin = Math.sin(pose.turn * DEGREES);

  return {
    alpha: Math.min(1, Math.max(0, pose.opacity)),
    at: {
      x: layer.cell.x - layer.centre.x,
      y: layer.cell.y - layer.centre.y,
    },
    matrix: [
      cos * across,
      sin * across,
      -sin * down,
      cos * down,
      layer.centre.x + pose.dx,
      layer.centre.y + pose.dy,
    ],
  };
};

const GUTTER = 2;

export const ATLAS_WIDTH = 2048;

export interface Packed {
  readonly height: number;
  readonly sources: readonly { readonly x: number; readonly y: number }[];
  readonly width: number;
}

export const packCells = (cells: readonly Box[]): Packed => {
  const width = Math.max(
    ATLAS_WIDTH,
    ...cells.map((cell) => cell.width + GUTTER)
  );

  const order = cells
    .map((cell, index) => ({ cell, index }))
    .toSorted((one, other) => other.cell.height - one.cell.height);

  const sources = cells.map(() => ({ x: 0, y: 0 }));
  let shelf = { height: 0, x: 0, y: 0 };

  for (const { cell, index } of order) {
    if (shelf.x + cell.width > width) {
      shelf = { height: 0, x: 0, y: shelf.y + shelf.height + GUTTER };
    }

    sources[index] = { x: shelf.x, y: shelf.y };
    shelf = {
      height: Math.max(shelf.height, cell.height),
      x: shelf.x + cell.width + GUTTER,
      y: shelf.y,
    };
  }

  return { height: shelf.y + shelf.height, sources, width };
};

export const BAND_AREA = 600_000;

export interface Band {
  readonly height: number;
  readonly members: readonly number[];
  readonly top: number;
  readonly width: number;
}

export const bandsOf = (
  cells: readonly Box[],
  packed: Packed
): readonly Band[] => {
  const shelves = new Map<number, number[]>();

  for (const index of cells.keys()) {
    const top = packed.sources[index]?.y ?? 0;

    shelves.set(top, [...(shelves.get(top) ?? []), index]);
  }

  const bands: {
    area: number;
    bottom: number;
    members: number[];
    top: number;
  }[] = [];

  for (const [top, members] of [...shelves.entries()].toSorted(
    ([one], [other]) => one - other
  )) {
    const area = members.reduce(
      (total, index) =>
        total + (cells[index]?.width ?? 0) * (cells[index]?.height ?? 0),
      0
    );

    const bottom = Math.max(
      ...members.map((index) => top + (cells[index]?.height ?? 0))
    );

    const open = bands.at(-1);

    if (open !== undefined && open.area + area <= BAND_AREA) {
      open.area += area;
      open.bottom = Math.max(open.bottom, bottom);
      open.members.push(...members);
    } else {
      bands.push({ area, bottom, members: [...members], top });
    }
  }

  return bands.map((band) => ({
    height: band.bottom - band.top,
    members: band.members,
    top: band.top,
    width: Math.max(
      ...band.members.map(
        (index) => (packed.sources[index]?.x ?? 0) + (cells[index]?.width ?? 0)
      )
    ),
  }));
};
