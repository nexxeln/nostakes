import type { Tier } from "@nostakes/room";

import { poseAtKeys } from "./replay-plan.js";
import type { Key } from "./replay-plan.js";
import { STING_HITS } from "./score.js";
import type { Family } from "./score.js";
import { partPose, REST } from "./timeline.js";
import type { Pose, Staging } from "./timeline.js";

export const CLIP_FPS = 30;

export const CLIP_HOLD_MS = 2000;

export const STING_TAIL_MS = 300;

export const CLIP_LONGEST_MS = 4500;

export const CLIP_SPREAD = 2.5;

const POT_LANDS_AFTER = 240;

const POT_STARTS = 620;

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

const NEAR = 0.005;

const resting = (pose: Pose) =>
  Math.abs(pose.dx) < NEAR &&
  Math.abs(pose.dy) < NEAR &&
  Math.abs(pose.turn) < NEAR &&
  Math.abs(pose.opacity - 1) < NEAR &&
  Math.abs(pose.scale - 1) < NEAR &&
  Math.abs(pose.squeeze - 1) < NEAR;

export const CLIP_STAGING: Staging = {
  landed: new Set(["felt", "title"]),
  spread: CLIP_SPREAD,
};

export const potLandsAt = (staging: Staging) =>
  POT_STARTS * staging.spread + POT_LANDS_AFTER;

export const stingStartMs = (family: Family, staging: Staging) =>
  Math.max(0, potLandsAt(staging) - STING_HITS[family] * 1000);

const HIDDEN: Pose = { ...REST, opacity: 0 };

const startsLanded = (role: string) =>
  role === BASE_ROLE || CLIP_STAGING.landed.has(role);

export const poseOf = (layer: Layer, ms: number, motion: Motion): Pose => {
  if (layer.keys.length > 0) {
    return poseAtKeys(layer.keys, ms);
  }

  if (ms < layer.from && !startsLanded(layer.role)) {
    return HIDDEN;
  }

  return partPose(
    layer.role,
    layer.index,
    Math.max(0, ms - layer.from),
    motion.family,
    motion.tier,
    CLIP_STAGING
  );
};

const LAST_FRAME_SEARCHED = (CLIP_LONGEST_MS * CLIP_FPS) / 1000;

export const settledFrame = (layers: readonly Layer[], motion: Motion) => {
  let settled = 0;

  for (let frame = 0; frame <= LAST_FRAME_SEARCHED; frame += 1) {
    const ms = frameMs(frame);

    if (layers.some((layer) => !resting(poseOf(layer, ms, motion)))) {
      settled = frame + 1;
    }
  }

  return settled;
};

export const clipFrames = (
  layers: readonly Layer[],
  motion: Motion,
  stingMs: number
) => {
  const moved = frameMs(settledFrame(layers, motion)) + CLIP_HOLD_MS;
  const rung = stingMs + STING_TAIL_MS;

  return Math.ceil(
    (Math.min(CLIP_LONGEST_MS, Math.max(moved, rung)) * CLIP_FPS) / 1000
  );
};

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
