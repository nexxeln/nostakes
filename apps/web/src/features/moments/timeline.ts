import type { Tier } from "@nostakes/room";

import type { Family } from "./score.js";

export interface Pose {
  readonly dx: number;
  readonly dy: number;
  readonly opacity: number;
  readonly scale: number;
  readonly squeeze: number;
  readonly turn: number;
}

export const REST: Pose = {
  dx: 0,
  dy: 0,
  opacity: 1,
  scale: 1,
  squeeze: 1,
  turn: 0,
};

export interface Plan {
  readonly hold: number;
  readonly leave: number;
}

const HOLDS: Readonly<Record<Family, readonly [number, number, number]>> = {
  Celebration: [1600, 2200, 3000],
  Groan: [2200, 2400, 2800],
  Relief: [1600, 1600, 1600],
  Reveal: [2000, 2400, 2400],
};

export const LEAVE_MS = 280;

export const planFor = (family: Family, tier: Tier): Plan => ({
  hold: HOLDS[family][tier - 1] ?? 1600,
  leave: LEAVE_MS,
});

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const progress = (ms: number, from: number, to: number) =>
  clamp((ms - from) / Math.max(1, to - from));

const easeOut = (value: number) => 1 - (1 - value) ** 3;

const easeBack = (value: number) => {
  const overshoot = 1.7;

  return 1 + (overshoot + 1) * (value - 1) ** 3 + overshoot * (value - 1) ** 2;
};

const between = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

export const cardPose = (family: Family, ms: number, plan: Plan): Pose => {
  const leaving = progress(ms, plan.hold, plan.hold + plan.leave);

  if (family === "Groan") {
    const sink = easeOut(progress(ms, 0, 650));

    return {
      ...REST,
      dy: between(-24, 0, sink) + leaving * 30,
      opacity: sink * (1 - leaving),
      turn: 0.6,
    };
  }

  const drop = easeBack(progress(ms, 0, 320));

  return {
    ...REST,
    dx: leaving * 260,
    dy: between(-70, 0, drop) - leaving * 320,
    opacity: clamp(progress(ms, 0, 120)) * (1 - leaving),
    scale: between(0.92, 1, drop) * between(1, 0.3, leaving),
    turn: between(-5, -1.5, drop),
  };
};

const SHAKE_FROM = 320;

const SHAKE_FOR = 240;

const shake = (ms: number, tier: Tier, from: number) =>
  tier === 3 && ms > from && ms < from + SHAKE_FOR
    ? Math.sin((ms - from + SHAKE_FROM) / 18) * 7
    : 0;

const stamp = (ms: number, from: number): Pose => {
  const landed = easeBack(progress(ms, from, from + 240));

  return {
    ...REST,
    opacity: progress(ms, from, from + 60),
    scale: between(1.4, 1, landed),
  };
};

const fade = (ms: number, from: number, to: number): Pose => ({
  ...REST,
  opacity: easeOut(progress(ms, from, to)),
});

const rise = (ms: number, from: number, distance: number): Pose => {
  const amount = easeOut(progress(ms, from, from + 260));

  return {
    ...REST,
    dy: between(distance, 0, amount),
    opacity: progress(ms, from, from + 80),
  };
};

const flip = (ms: number, from: number): Pose => ({
  ...REST,
  opacity: ms < from ? 0 : 1,
  squeeze: Math.max(0.02, easeOut(progress(ms, from, from + 200))),
});

const fall = (ms: number, index: number, from: number): Pose => {
  const amount = easeOut(progress(ms, from, from + 900));

  return {
    ...REST,
    dy: between(-520, 0, amount),
    opacity: progress(ms, from, from + 60),
    turn: between(45 - ((index * 53) % 90), 0, amount),
  };
};

export interface Staging {
  readonly landed: ReadonlySet<string>;
  readonly spread: number;
}

export const TABLE_STAGING: Staging = { landed: new Set(), spread: 1 };

export const partPose = (
  role: string,
  index: number,
  ms: number,
  family: Family,
  tier: Tier,
  staging: Staging = TABLE_STAGING
): Pose => {
  if (staging.landed.has(role)) {
    return REST;
  }

  const groan = family === "Groan";
  const at = (start: number) => start * staging.spread;

  const fadeFrom = (start: number, length: number) =>
    fade(ms, at(start), at(start) + length);

  const shaken = shake(ms, tier, at(SHAKE_FROM));

  const face = () =>
    groan
      ? rise(ms, at(200 + index * 120), index === 0 ? -14 : 14)
      : { ...stamp(ms, at(200 + index * 90)), dx: shaken };

  const hole = () =>
    family === "Reveal"
      ? flip(ms, at(420 + index * 90))
      : rise(ms, at(300 + index * 60), 34);

  const lifted = () => ({
    ...rise(ms, at(520 + index * 50), 26),
    opacity: fadeFrom(240 + index * 40, 180).opacity,
  });

  const title = () =>
    groan
      ? fadeFrom(300, 600)
      : { ...stamp(ms, at(family === "Reveal" ? 760 : 140)), dx: shaken };

  const poses = new Map<string, () => Pose>([
    ["also", () => fadeFrom(760, 200)],
    ["board", () => fadeFrom(240 + index * 40, 180)],
    ["face", face],
    ["felt", () => ({ ...REST, dx: shaken })],
    ["hole", hole],
    ["lifted", lifted],
    ["line", () => fadeFrom(groan ? 700 : 380, 300)],
    ["mark", () => fadeFrom(760, 200)],
    ["pot", () => stamp(ms, at(620))],
    ["scrap", () => fall(ms, index, at(160 + index * 14))],
    ["title", title],
  ]);

  return poses.get(role)?.() ?? REST;
};

export const transformOf = (pose: Pose) =>
  `translate(${pose.dx.toFixed(1)}px, ${pose.dy.toFixed(1)}px) rotate(${pose.turn.toFixed(2)}deg) scale(${(pose.scale * pose.squeeze).toFixed(3)}, ${pose.scale.toFixed(3)})`;

export const samplesOf = (length: number, step = 40) =>
  Array.from({ length: Math.floor(length / step) + 1 }, (_, index) =>
    Math.min(length, index * step)
  );
