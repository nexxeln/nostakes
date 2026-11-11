import { Option } from "effect";

import { REST } from "./timeline.js";
import type { Pose } from "./timeline.js";

export type { Pose } from "./timeline.js";

export type Ease = "Hold" | "In" | "InOut" | "Linear" | "Out";

export interface FilmKey {
  readonly at: number;
  readonly ease?: Ease;
  readonly pose: Pose;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface Shot {
  readonly art: string;
  readonly box: Box;
  readonly keys: readonly FilmKey[];
  readonly pinned?: boolean;
  readonly pivot?: Point;
}

export interface Mix {
  readonly channels: readonly Float32Array<ArrayBuffer>[];
  readonly sampleRate: number;
}

export interface Film {
  readonly camera: readonly FilmKey[];
  readonly fps: FilmRate;
  readonly height: number;
  readonly length: number;
  readonly shots: readonly Shot[];
  readonly sound: Mix | null;
  readonly width: number;
}

export const FILM_RATES = [24, 25, 30] as const;

export type FilmRate = (typeof FILM_RATES)[number];

export const LONGEST_FILM_MS = 60_000;

export const LARGEST_FILM_SIDE = 1920;

export const SOUND_RATES = [44_100, 48_000] as const;

const ROUNDING = 1e-6;

export const filmFrames = (film: Pick<Film, "fps" | "length">) =>
  Math.ceil((film.length * film.fps) / 1000 - ROUNDING);

export const frameTime = (frame: number, fps: number) => (frame * 1000) / fps;

export const filmSamples = (film: Pick<Film, "fps" | "length">, rate: number) =>
  Math.round((filmFrames(film) * rate) / film.fps);

const HIDDEN: Pose = { ...REST, opacity: 0 };

const eased = (ease: Ease, amount: number) => {
  if (ease === "Hold") {
    return 0;
  }

  if (ease === "Linear") {
    return amount;
  }

  if (ease === "In") {
    return amount ** 3;
  }

  if (ease === "Out") {
    return 1 - (1 - amount) ** 3;
  }

  return amount < 0.5 ? 4 * amount ** 3 : 1 - (-2 * amount + 2) ** 3 / 2;
};

export const poseAt = (keys: readonly FilmKey[], ms: number): Pose => {
  const [first] = keys;

  if (first === undefined || ms < first.at) {
    return HIDDEN;
  }

  const next = keys.findIndex((key) => key.at > ms);

  if (next === -1) {
    return keys.at(-1)?.pose ?? HIDDEN;
  }

  const from = keys[next - 1] ?? first;
  const to = keys[next] ?? from;

  const amount = eased(
    to.ease ?? "Out",
    (ms - from.at) / Math.max(1, to.at - from.at)
  );

  const mix = (start: number, end: number) => start + (end - start) * amount;

  return {
    dx: mix(from.pose.dx, to.pose.dx),
    dy: mix(from.pose.dy, to.pose.dy),
    opacity: mix(from.pose.opacity, to.pose.opacity),
    scale: mix(from.pose.scale, to.pose.scale),
    squeeze: mix(from.pose.squeeze, to.pose.squeeze),
    turn: mix(from.pose.turn, to.pose.turn),
  };
};

export type Matrix = readonly [number, number, number, number, number, number];

export interface Placed {
  readonly alpha: number;
  readonly matrix: Matrix;
}

const DEGREES = Math.PI / 180;

const times = (outer: Matrix, inner: Matrix): Matrix => [
  outer[0] * inner[0] + outer[2] * inner[1],
  outer[1] * inner[0] + outer[3] * inner[1],
  outer[0] * inner[2] + outer[2] * inner[3],
  outer[1] * inner[2] + outer[3] * inner[3],
  outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
  outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
];

const posed = (pose: Pose, pivot: Point): Matrix => {
  const across = pose.scale * pose.squeeze;
  const down = pose.scale;
  const cos = Math.cos(pose.turn * DEGREES);
  const sin = Math.sin(pose.turn * DEGREES);

  return times(
    [
      cos * across,
      sin * across,
      -sin * down,
      cos * down,
      pivot.x + pose.dx,
      pivot.y + pose.dy,
    ],
    [1, 0, 0, 1, -pivot.x, -pivot.y]
  );
};

export const UNMOVED: Matrix = [1, 0, 0, 1, 0, 0];

export const cameraAt = (
  film: Pick<Film, "camera" | "height" | "width">,
  ms: number
): Matrix =>
  film.camera.length === 0
    ? UNMOVED
    : posed(poseAt(film.camera, ms), { x: film.width / 2, y: film.height / 2 });

export const pivotOf = (shot: Pick<Shot, "box" | "pivot">): Point =>
  shot.pivot ?? {
    x: shot.box.x + shot.box.width / 2,
    y: shot.box.y + shot.box.height / 2,
  };

export const placedAt = (
  shot: Pick<Shot, "box" | "pinned" | "pivot">,
  pose: Pose,
  camera: Matrix
): Placed => ({
  alpha: Math.min(1, Math.max(0, pose.opacity)),
  matrix: times(
    shot.pinned === true ? UNMOVED : camera,
    times(posed(pose, pivotOf(shot)), [1, 0, 0, 1, shot.box.x, shot.box.y])
  ),
});

const sameMatrix = (one: Matrix, other: Matrix) =>
  one.every((value, index) => value === other[index]);

export const samePlace = (one: Placed, other: Placed) =>
  one.alpha === other.alpha && sameMatrix(one.matrix, other.matrix);

const FRINGE = 2;

const evenDown = (value: number) => Math.floor(value / 2) * 2;

const evenUp = (value: number) => Math.ceil(value / 2) * 2;

export const boundsOf = (
  size: { readonly height: number; readonly width: number },
  placed: Placed,
  frame: { readonly height: number; readonly width: number }
): Option.Option<Box> => {
  if (placed.alpha <= 0) {
    return Option.none();
  }

  const [a, b, c, d, e, f] = placed.matrix;

  const corners = [
    [0, 0],
    [size.width, 0],
    [0, size.height],
    [size.width, size.height],
  ].map(([x = 0, y = 0]) => ({ x: a * x + c * y + e, y: b * x + d * y + f }));

  const left = Math.max(
    0,
    evenDown(Math.min(...corners.map((corner) => corner.x)) - FRINGE)
  );

  const top = Math.max(
    0,
    evenDown(Math.min(...corners.map((corner) => corner.y)) - FRINGE)
  );

  const right = Math.min(
    frame.width,
    evenUp(Math.max(...corners.map((corner) => corner.x)) + FRINGE)
  );

  const bottom = Math.min(
    frame.height,
    evenUp(Math.max(...corners.map((corner) => corner.y)) + FRINGE)
  );

  return right > left && bottom > top
    ? Option.some({
        height: bottom - top,
        width: right - left,
        x: left,
        y: top,
      })
    : Option.none();
};

const even = (value: number) => value % 2 === 0;

export const filmProblem = (film: Film): Option.Option<string> => {
  if (
    !even(film.width) ||
    !even(film.height) ||
    film.width <= 0 ||
    film.height <= 0 ||
    Math.max(film.width, film.height) > LARGEST_FILM_SIDE
  ) {
    return Option.some(
      `a film is ${film.width} by ${film.height}; both sides must be even and at most ${LARGEST_FILM_SIDE}`
    );
  }

  if (film.length <= 0 || film.length > LONGEST_FILM_MS) {
    return Option.some(
      `a film runs ${film.length} ms; it must run more than 0 and at most ${LONGEST_FILM_MS}`
    );
  }

  if (film.shots.length === 0) {
    return Option.some("a film has no shots to draw");
  }

  const { sound } = film;

  if (sound === null) {
    return Option.none();
  }

  if (
    sound.channels.length < 1 ||
    sound.channels.length > 2 ||
    !SOUND_RATES.some((rate) => rate === sound.sampleRate)
  ) {
    return Option.some(
      `a film's sound has ${sound.channels.length} channels at ${sound.sampleRate} Hz; it needs one or two at 44100 or 48000`
    );
  }

  const [first] = sound.channels;
  const length = first?.length ?? 0;

  return sound.channels.every((channel) => channel.length === length)
    ? Option.none()
    : Option.some("a film's sound channels differ in length");
};

const samePose = (one: Pose, other: Pose) =>
  one.dx === other.dx &&
  one.dy === other.dy &&
  one.opacity === other.opacity &&
  one.scale === other.scale &&
  one.squeeze === other.squeeze &&
  one.turn === other.turn;

export const sampledKeys = (
  poseOf: (ms: number) => Pose,
  frames: number,
  fps: number
): readonly FilmKey[] => {
  const poses = Array.from({ length: frames }, (_, frame) => ({
    at: frameTime(frame, fps),
    pose: poseOf(frameTime(frame, fps)),
  }));

  const shown = poses.findIndex((each) => each.pose.opacity > 0);

  if (shown === -1) {
    return [];
  }

  return poses
    .slice(shown)
    .filter((each, index, kept) => {
      const before = kept[index - 1];
      const after = kept[index + 1];

      return (
        before === undefined ||
        after === undefined ||
        !samePose(before.pose, each.pose) ||
        !samePose(after.pose, each.pose)
      );
    })
    .map((each) => ({ at: each.at, ease: "Linear", pose: each.pose }));
};
