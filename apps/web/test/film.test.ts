import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  cameraAt,
  filmFrames,
  frameTime,
  placedAt,
  poseAt,
  sampledKeys,
  UNMOVED,
} from "../src/features/moments/film.js";
import type { Placed } from "../src/features/moments/film.js";
import { REST } from "../src/features/moments/timeline.js";
import type { Pose } from "../src/features/moments/timeline.js";

const rounded = (value: number) => Math.round(value * 1000) / 1000;

const corner = (placed: Placed, x: number, y: number) => {
  const [a, b, c, d, e, f] = placed.matrix;

  return { x: rounded(a * x + c * y + e), y: rounded(b * x + d * y + f) };
};

const between = (minimum: number, maximum: number) =>
  Schema.Int.check(Schema.isBetween({ maximum, minimum }));

const PoseSchema = Schema.Struct({
  dx: between(-300, 300),
  dy: between(-300, 300),
  opacity: Schema.Literals([0, 0.5, 1]),
  scale: Schema.Literals([0.5, 1, 1.5]),
  squeeze: Schema.Literals([0.2, 1]),
  turn: between(-30, 30),
});

const SIGNLESS_ZERO = 0;

const unsigned = (pose: Pose): Pose => ({
  dx: pose.dx + SIGNLESS_ZERO,
  dy: pose.dy + SIGNLESS_ZERO,
  opacity: pose.opacity + SIGNLESS_ZERO,
  scale: pose.scale + SIGNLESS_ZERO,
  squeeze: pose.squeeze + SIGNLESS_ZERO,
  turn: pose.turn + SIGNLESS_ZERO,
});

describe("a film's frames", () => {
  it("draws a shot at rest exactly where its box is", () => {
    const placed = placedAt(
      { box: { height: 40, width: 120, x: 300, y: 500 } },
      REST,
      UNMOVED
    );

    expect({
      alpha: placed.alpha,
      bottomRight: corner(placed, 120, 40),
      topLeft: corner(placed, 0, 0),
    }).toStrictEqual({
      alpha: 1,
      bottomRight: { x: 420, y: 540 },
      topLeft: { x: 300, y: 500 },
    });
  });

  it("turns, squeezes, and moves a shot about its pivot, as the table's transform-box does", () => {
    const placed = placedAt(
      { box: { height: 100, width: 100, x: 0, y: 0 } },
      {
        ...REST,
        dx: 10,
        dy: -4,
        opacity: 0.5,
        scale: 2,
        squeeze: 0.5,
        turn: 90,
      },
      UNMOVED
    );

    expect({
      alpha: placed.alpha,
      centre: corner(placed, 50, 50),
      topLeft: corner(placed, 0, 0),
    }).toStrictEqual({
      alpha: 0.5,
      centre: { x: 60, y: 46 },
      topLeft: { x: 160, y: -4 },
    });
  });

  it("moves every shot with the camera except a pinned one", () => {
    const camera = cameraAt(
      {
        camera: [{ at: 0, pose: { ...REST, dx: -100, scale: 2 } }],
        height: 1920,
        width: 1080,
      },
      0
    );

    const box = { height: 10, width: 10, x: 540, y: 960 };

    expect({
      filmed: corner(placedAt({ box }, REST, camera), 0, 0),
      pinned: corner(placedAt({ box, pinned: true }, REST, camera), 0, 0),
    }).toStrictEqual({
      filmed: { x: 440, y: 960 },
      pinned: { x: 540, y: 960 },
    });
  });

  it.prop(
    "counts the frames a film of whole frames was given, at every rate",
    {
      fps: Arbitrary.schema(Schema.Literals([24, 25, 30])),
      frames: Arbitrary.schema(between(1, 2000)),
    },
    ({ fps, frames }) => {
      expect(filmFrames({ fps, length: frameTime(frames, fps) })).toBe(frames);
    }
  );

  it.prop(
    "replays every sampled pose exactly at its frame, and hides a shot before it first shows",
    {
      palette: Arbitrary.schema(
        Schema.Array(PoseSchema).check(
          Schema.isMinLength(3),
          Schema.isMaxLength(3)
        )
      ),
      picks: Arbitrary.schema(
        Schema.Array(between(0, 2)).check(
          Schema.isMinLength(2),
          Schema.isMaxLength(40)
        )
      ),
    },
    ({ palette, picks }) => {
      const poses = picks.map((pick) => unsigned(palette[pick] ?? REST));
      const at = (ms: number): Pose => poses[Math.round(ms / 40)] ?? REST;
      const keys = sampledKeys(at, poses.length, 25);
      const shown = poses.findIndex((pose) => pose.opacity > 0);

      expect(
        poses.map((_, frame) => poseAt(keys, frameTime(frame, 25)))
      ).toStrictEqual(
        poses.map((pose, frame) =>
          shown === -1 || frame < shown ? { ...REST, opacity: 0 } : pose
        )
      );
    }
  );
});
