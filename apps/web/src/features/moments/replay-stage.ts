import type { Expression } from "@nostakes/avatar";

import { REST } from "./timeline.js";
import type { Pose } from "./timeline.js";

export type SpriteArt =
  | {
      readonly avatar: string;
      readonly expression: Expression;
      readonly kind: "Face";
      readonly size: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: "Label";
      readonly size: number;
      readonly text: string;
      readonly tone: "Ink" | "Muted";
      readonly weight: "Bold" | "Heavy";
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: "Caption";
      readonly lines: readonly string[];
      readonly size: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly card: string;
      readonly kind: "Card";
      readonly turn: number;
      readonly width: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: "Pill";
      readonly size: number;
      readonly text: string;
      readonly tone: "Paper" | "Red";
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly height: number;
      readonly kind: "Bar";
      readonly tone: "Lead" | "Other" | "Track";
      readonly width: number;
      readonly x: number;
      readonly y: number;
    };

export interface Key {
  readonly at: number;
  readonly pose: Pose;
}

export interface ReplaySprite {
  readonly art: SpriteArt;
  readonly keys: readonly Key[];
  readonly shownAt: number;
}

export type Entrance = "Cut" | "Drop" | "Fade" | "Rise" | "Slam" | "Stamp";

export interface Placed {
  readonly art: SpriteArt;
  readonly enter?: Entrance;
  readonly pose?: Pose;
}

export type Layout = ReadonlyMap<string, Placed>;

const HIDDEN: Pose = { ...REST, opacity: 0 };

interface Slot {
  readonly art: string;
  readonly index: number;
  readonly pose: string;
}

export interface Stager {
  readonly slots: Map<string, Slot>;
  readonly sprites: { art: SpriteArt; keys: Key[]; shownAt: number }[];
}

export const stagerOf = (): Stager => ({ slots: new Map(), sprites: [] });

const lastPose = (keys: readonly Key[]) => keys.at(-1)?.pose ?? HIDDEN;

const lastAt = (keys: readonly Key[]) => keys.at(-1)?.at ?? 0;

const settled = (keys: Key[], at: number) => {
  const when = Math.max(at, lastAt(keys));

  keys.push({ at: when, pose: lastPose(keys) });

  return when;
};

export const SLAM_MS = 150;

const entering = (
  entrance: Entrance,
  at: number,
  rest: Pose
): readonly Key[] => {
  const unseen = { ...rest, opacity: 0 };

  const ways: Readonly<Record<Entrance, readonly Key[]>> = {
    Cut: [{ at, pose: rest }],
    Drop: [
      { at, pose: { ...unseen, dy: rest.dy - 44 } },
      { at: at + 60, pose: { ...rest, dy: rest.dy - 30 } },
      { at: at + 220, pose: rest },
    ],
    Fade: [
      { at, pose: unseen },
      { at: at + 120, pose: rest },
    ],
    Rise: [
      { at, pose: { ...unseen, dy: rest.dy + 24 } },
      { at: at + 180, pose: rest },
    ],
    Slam: [
      { at, pose: { ...unseen, scale: rest.scale * 2.3 } },
      { at: at + 40, pose: { ...rest, scale: rest.scale * 2.1 } },
      { at: at + SLAM_MS, pose: rest },
      { at: at + SLAM_MS + 50, pose: { ...rest, scale: rest.scale * 1.06 } },
      { at: at + SLAM_MS + 180, pose: rest },
    ],
    Stamp: [
      { at, pose: { ...unseen, scale: rest.scale * 1.4 } },
      { at: at + 50, pose: { ...rest, scale: rest.scale * 1.32 } },
      { at: at + 230, pose: rest },
    ],
  };

  return ways[entrance];
};

const DEFAULT_ENTRANCES: Readonly<Record<SpriteArt["kind"], Entrance>> = {
  Bar: "Fade",
  Caption: "Rise",
  Card: "Drop",
  Face: "Fade",
  Label: "Fade",
  Pill: "Stamp",
};

const FADE_OUT_MS = 90;

const MOVE_MS = 320;

const CUT_MS = 1;

const leave = (stager: Stager, name: string, at: number, ms: number) => {
  const slot = stager.slots.get(name);
  const sprite = slot === undefined ? undefined : stager.sprites[slot.index];

  if (sprite === undefined) {
    return;
  }

  const when = settled(sprite.keys, at);

  sprite.keys.push({
    at: when + ms,
    pose: { ...lastPose(sprite.keys), opacity: 0 },
  });
  stager.slots.delete(name);
};

export const poseAtKeys = (keys: readonly Key[], ms: number): Pose => {
  const [first] = keys;

  if (first === undefined || ms < first.at) {
    return HIDDEN;
  }

  const next = keys.findIndex((key) => key.at > ms);

  if (next === -1) {
    return lastPose(keys);
  }

  const from = keys[next - 1] ?? first;
  const to = keys[next] ?? from;
  const amount = 1 - (1 - (ms - from.at) / Math.max(1, to.at - from.at)) ** 3;
  const mix = (one: number, other: number) => one + (other - one) * amount;

  return {
    dx: mix(from.pose.dx, to.pose.dx),
    dy: mix(from.pose.dy, to.pose.dy),
    opacity: mix(from.pose.opacity, to.pose.opacity),
    scale: mix(from.pose.scale, to.pose.scale),
    squeeze: mix(from.pose.squeeze, to.pose.squeeze),
    turn: mix(from.pose.turn, to.pose.turn),
  };
};

export const cleared = (stager: Stager, at: number, ms: number) => {
  for (const name of stager.slots.keys()) {
    leave(stager, name, at, ms);
  }

  for (const sprite of stager.sprites) {
    if (lastAt(sprite.keys) > at + ms) {
      const held = poseAtKeys(sprite.keys, at);
      const kept = sprite.keys.filter((key) => key.at < at);

      sprite.keys.length = 0;
      sprite.keys.push(
        ...kept,
        { at, pose: held },
        { at: at + ms, pose: { ...held, opacity: 0 } }
      );
    }
  }
};

export const sent = (
  stager: Stager,
  name: string,
  motion: {
    readonly at: number;
    readonly by: { readonly x: number; readonly y: number };
    readonly ms: number;
  }
) => {
  const slot = stager.slots.get(name);
  const sprite = slot === undefined ? undefined : stager.sprites[slot.index];

  if (sprite === undefined) {
    return;
  }

  const when = settled(sprite.keys, motion.at);
  const from = lastPose(sprite.keys);

  sprite.keys.push({
    at: when + motion.ms,
    pose: {
      ...from,
      dx: from.dx + motion.by.x,
      dy: from.dy + motion.by.y,
      opacity: 0,
      scale: from.scale * 0.8,
    },
  });
  stager.slots.delete(name);
};

const FLOAT = { fades: 1600, rests: 140, rises: 230, travels: 1250 };

export const floated = (stager: Stager, art: SpriteArt, at: number) => {
  const low = { ...REST, dy: 26, opacity: 0 };
  const high = { ...REST, dy: -FLOAT.rises };

  stager.sprites.push({
    art,
    keys: [
      { at, pose: low },
      { at: at + FLOAT.rests, pose: REST },
      { at: at + FLOAT.travels, pose: high },
      { at: at + FLOAT.fades, pose: { ...high, opacity: 0 } },
    ],
    shownAt: at,
  });
};

export const staged = (
  stager: Stager,
  layout: Layout,
  at: number,
  cut: boolean
) => {
  for (const name of stager.slots.keys()) {
    const wanted = layout.get(name);
    const held = stager.slots.get(name);

    if (
      wanted === undefined ||
      (held !== undefined && JSON.stringify(wanted.art) !== held.art)
    ) {
      leave(stager, name, at, cut ? CUT_MS : FADE_OUT_MS);
    }
  }

  for (const [name, placed] of layout) {
    const rest = placed.pose ?? REST;
    const pose = JSON.stringify(rest);
    const held = stager.slots.get(name);

    if (held === undefined) {
      stager.sprites.push({
        art: placed.art,
        keys: [
          ...entering(
            cut ? "Cut" : (placed.enter ?? DEFAULT_ENTRANCES[placed.art.kind]),
            at,
            rest
          ),
        ],
        shownAt: at,
      });
      stager.slots.set(name, {
        art: JSON.stringify(placed.art),
        index: stager.sprites.length - 1,
        pose,
      });
    } else if (held.pose !== pose) {
      const sprite = stager.sprites[held.index];

      if (sprite !== undefined) {
        const when = settled(sprite.keys, at);

        sprite.keys.push({ at: when + (cut ? CUT_MS : MOVE_MS), pose: rest });
        stager.slots.set(name, { ...held, pose });
      }
    }
  }
};
