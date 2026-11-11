import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { SAMPLE_NAMES, samplePicture } from "../scripts/moments/samples.js";
import {
  bandsOf,
  CLIP_FPS,
  CLIP_STAGING,
  CLIP_HOLD_MS,
  CLIP_LONGEST_MS,
  clipFrames,
  frameMs,
  packCells,
  placementOf,
  poseOf,
  settledFrame,
} from "../src/features/moments/clip-plan.js";
import type { Layer } from "../src/features/moments/clip-plan.js";
import { pictureSvg } from "../src/features/moments/picture.js";
import {
  FAMILIES,
  momentScore,
  scoreLength,
} from "../src/features/moments/score.js";
import { partPose, REST } from "../src/features/moments/timeline.js";

const PART = /data-part="(?<role>[a-z]+)" data-index="(?<index>\d+)"/gu;

const layersOf = (name: string): readonly Layer[] =>
  [
    ...pictureSvg(samplePicture(name), {
      deck: "TwoColour",
      fonts: "",
      frame: "Chat",
      theme: "Light",
    }).matchAll(PART),
  ].map((found) => ({
    band: 0,
    cell: { height: 100, width: 100, x: 0, y: 0 },
    centre: { x: 50, y: 50 },
    index: Number(found.groups?.index ?? "0"),
    role: found.groups?.role ?? "",
    source: { x: 0, y: 0 },
  }));

const motionOf = (name: string) => {
  const picture = samplePicture(name);

  return { family: FAMILIES[picture.kind], tier: picture.tier };
};

const stingMsOf = (name: string) => {
  const picture = samplePicture(name);

  return scoreLength(momentScore(picture.kind, picture.tier)) * 1000;
};

const rounded = (value: number) => Math.round(value * 1000) / 1000;

const roundedPose = (pose: typeof REST) => ({
  dx: rounded(pose.dx),
  dy: rounded(pose.dy),
  opacity: rounded(pose.opacity),
  scale: rounded(pose.scale),
  squeeze: rounded(pose.squeeze),
  turn: rounded(pose.turn),
});

describe("a moment's clip", () => {
  it("ends every sample moment with every part at rest, the frame the still picture shows", () => {
    const ends = SAMPLE_NAMES.map((name) => {
      const layers = layersOf(name);

      const last = frameMs(
        clipFrames(layers, motionOf(name), stingMsOf(name)) - 1
      );

      return {
        name,
        poses: layers.map((layer) =>
          roundedPose(poseOf(layer, last, motionOf(name)))
        ),
      };
    });

    expect(ends).toStrictEqual(
      ends.map(({ name, poses }) => ({
        name,
        poses: poses.map(() => roundedPose(REST)),
      }))
    );
  });

  it("opens every sample clip with the card and the title landed, and moves every other part exactly as the table does", () => {
    const found = SAMPLE_NAMES.map((name) => {
      const motion = motionOf(name);
      const layers = layersOf(name);
      const frames = clipFrames(layers, motion, stingMsOf(name));

      const landed = layers.filter((layer) =>
        CLIP_STAGING.landed.has(layer.role)
      );

      const drifted = layers
        .filter((layer) => !CLIP_STAGING.landed.has(layer.role))
        .flatMap((layer) =>
          Array.from({ length: frames }, (_, frame) => frameMs(frame)).filter(
            (ms) =>
              JSON.stringify(poseOf(layer, ms, motion)) !==
              JSON.stringify(
                partPose(
                  layer.role,
                  layer.index,
                  ms,
                  motion.family,
                  motion.tier
                )
              )
          )
        );

      return {
        drifted: drifted.length,
        firstFrame: landed.map((layer) => ({
          pose: roundedPose(poseOf(layer, 0, motion)),
          role: layer.role,
        })),
        name,
      };
    });

    expect(found).toStrictEqual(
      SAMPLE_NAMES.map((name) => ({
        drifted: 0,
        firstFrame: [
          { pose: roundedPose(REST), role: "felt" },
          { pose: roundedPose(REST), role: "title" },
        ],
        name,
      }))
    );
  });

  it("leaves the table's own staging alone, so the table still brings the title in", () => {
    expect(
      (["Celebration", "Groan", "Reveal"] as const).map((family) => {
        const pose = partPose("title", 0, 0, family, 2);

        return { family, opacity: pose.opacity, scale: rounded(pose.scale) };
      })
    ).toStrictEqual([
      { family: "Celebration", opacity: 0, scale: 1.4 },
      { family: "Groan", opacity: 0, scale: 1 },
      { family: "Reveal", opacity: 0, scale: 1.4 },
    ]);
  });

  it("holds the still for two seconds after the last part lands, outlasts the sting, and stays within four seconds", () => {
    const timings = SAMPLE_NAMES.map((name) => {
      const layers = layersOf(name);
      const frames = clipFrames(layers, motionOf(name), stingMsOf(name));

      const held =
        frameMs(frames) - frameMs(settledFrame(layers, motionOf(name)));

      return {
        heldLongEnough:
          held >= CLIP_HOLD_MS || frameMs(frames) >= CLIP_LONGEST_MS,
        name,
        outlastsSting:
          frameMs(frames) >= Math.min(CLIP_LONGEST_MS, stingMsOf(name)),
        withinLongest: frames <= (CLIP_LONGEST_MS * CLIP_FPS) / 1000,
      };
    });

    expect(timings).toStrictEqual(
      SAMPLE_NAMES.map((name) => ({
        heldLongEnough: true,
        name,
        outlastsSting: true,
        withinLongest: true,
      }))
    );
  });

  it("draws a part at rest exactly where the picture has it", () => {
    const layer: Layer = {
      band: 0,
      cell: { height: 40, width: 120, x: 300, y: 500 },
      centre: { x: 361.5, y: 519.25 },
      index: 0,
      role: "pot",
      source: { x: 0, y: 0 },
    };

    expect(placementOf(layer, REST)).toStrictEqual({
      alpha: 1,
      at: { x: -61.5, y: -19.25 },
      matrix: [1, 0, -0, 1, 361.5, 519.25],
    });
  });

  it("turns, squeezes, and moves a part about its own centre, as the table's transform-box does", () => {
    const layer: Layer = {
      band: 0,
      cell: { height: 100, width: 100, x: 0, y: 0 },
      centre: { x: 50, y: 50 },
      index: 0,
      role: "hole",
      source: { x: 0, y: 0 },
    };

    const placed = placementOf(layer, {
      ...REST,
      dx: 10,
      dy: -4,
      opacity: 0.5,
      scale: 2,
      squeeze: 0.5,
      turn: 90,
    });

    const [a, b, c, d, e, f] = placed.matrix;

    const corner = (x: number, y: number) => ({
      x: rounded(a * (x + placed.at.x) + c * (y + placed.at.y) + e),
      y: rounded(b * (x + placed.at.x) + d * (y + placed.at.y) + f),
    });

    expect({
      alpha: placed.alpha,
      centre: corner(50, 50),
      topLeft: corner(0, 0),
    }).toStrictEqual({
      alpha: 0.5,
      centre: { x: 60, y: 46 },
      topLeft: { x: 160, y: -4 },
    });
  });

  const cells = Arbitrary.schema(
    Schema.Array(
      Schema.Struct({
        height: Schema.Int.check(
          Schema.isBetween({ maximum: 1400, minimum: 1 })
        ),
        width: Schema.Int.check(
          Schema.isBetween({ maximum: 1100, minimum: 1 })
        ),
        x: Schema.Int,
        y: Schema.Int,
      })
    ).check(Schema.isMaxLength(80))
  );

  it.prop(
    "packs every layer into the atlas without two layers touching",
    { boxes: cells },
    ({ boxes }) => {
      const packed = packCells(boxes);

      const placed = boxes.map((box, index) => ({
        ...box,
        ...packed.sources[index],
      }));

      const touching = placed.flatMap((one, index) =>
        placed
          .slice(index + 1)
          .filter(
            (other) =>
              one.x < other.x + other.width + 1 &&
              other.x < one.x + one.width + 1 &&
              one.y < other.y + other.height + 1 &&
              other.y < one.y + one.height + 1
          )
      );

      const outside = placed.filter(
        (box) =>
          box.x < 0 ||
          box.y < 0 ||
          box.x + box.width > packed.width ||
          box.y + box.height > packed.height
      );

      expect({ outside, touching }).toStrictEqual({
        outside: [],
        touching: [],
      });
    }
  );

  it.prop(
    "draws every layer in exactly one band, inside that band's rows and columns",
    { boxes: cells },
    ({ boxes }) => {
      const packed = packCells(boxes);
      const bands = bandsOf(boxes, packed);

      const misplaced = boxes.flatMap((box, index) => {
        const holding = bands.filter((band) => band.members.includes(index));
        const source = packed.sources[index] ?? { x: -1, y: -1 };
        const [band] = holding;

        return holding.length === 1 &&
          band !== undefined &&
          source.y >= band.top &&
          source.y + box.height <= band.top + band.height &&
          source.x + box.width <= band.width
          ? []
          : [index];
      });

      expect(misplaced).toStrictEqual([]);
    }
  );
});
