import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { SAMPLE_NAMES, samplePicture } from "../scripts/moments/samples.js";
import {
  bandsOf,
  packCells,
  placementOf,
  SHORT_CLIP,
  shortHook,
  shortPose,
  shortSheet,
} from "../src/features/moments/clip-plan.js";
import type { Layer } from "../src/features/moments/clip-plan.js";
import { pictureSvg } from "../src/features/moments/picture.js";
import { poseAtKeys } from "../src/features/moments/replay-plan.js";
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
    from: 0,
    index: Number(found.groups?.index ?? "0"),
    keys: [],
    role: found.groups?.role ?? "",
    source: { x: 0, y: 0 },
  }));

const rounded = (value: number) => Math.round(value * 1000) / 1000;

const roundedPose = (pose: typeof REST) => ({
  dx: rounded(pose.dx),
  dy: rounded(pose.dy),
  opacity: rounded(pose.opacity),
  scale: rounded(pose.scale),
  squeeze: rounded(pose.squeeze),
  turn: rounded(pose.turn),
});

const STEP = 10;

const HOOK_ROLES = new Set(["face", "felt", "hole", "mark"]);

const HELD_MS = 700;

const TWO_FRAMES = 67;

const firstSeen = (layer: Layer) => {
  for (let ms = 0; ms <= SHORT_CLIP.lengthMs; ms += STEP) {
    if (shortPose(layer, ms).opacity > 0) {
      return ms;
    }
  }

  return SHORT_CLIP.lengthMs;
};

const lastMoved = (layer: Layer) => {
  const resting = JSON.stringify(roundedPose(REST));
  let moved = 0;

  for (let ms = 0; ms <= SHORT_CLIP.lengthMs; ms += STEP) {
    if (JSON.stringify(roundedPose(shortPose(layer, ms))) !== resting) {
      moved = ms + STEP;
    }
  }

  return moved;
};

describe("a moment's short clip", () => {
  it("opens every sample on the hook: the felt, the faces, and their cards at rest, and none of the card's own words", () => {
    const opened = SAMPLE_NAMES.map((name) => ({
      name,
      shown: [
        ...new Set(
          layersOf(name)
            .filter((layer) => shortPose(layer, 0).opacity > 0)
            .map((layer) => layer.role)
        ),
      ].toSorted(),
      unrested: layersOf(name).filter(
        (layer) =>
          HOOK_ROLES.has(layer.role) &&
          JSON.stringify(roundedPose(shortPose(layer, 0))) !==
            JSON.stringify(roundedPose(REST))
      ).length,
    }));

    expect(opened).toStrictEqual(
      opened.map(({ name, shown }) => ({
        name,
        shown: shown.filter((role) => HOOK_ROLES.has(role)),
        unrested: 0,
      }))
    );
  });

  it("says the picture's line large from the first frame and takes it away as the title lands", () => {
    const hooks = SAMPLE_NAMES.map((name) => {
      const [hook] = shortHook(samplePicture(name).line, "Story");

      return {
        name,
        said:
          hook?.art.kind === "Caption"
            ? hook.art.lines.join(" ")
            : "no caption",
        seen: [0, SHORT_CLIP.pauseMs, SHORT_CLIP.hitMs].map(
          (ms) => poseAtKeys(hook?.keys ?? [], ms).opacity
        ),
      };
    });

    expect(hooks).toStrictEqual(
      SAMPLE_NAMES.map((name) => ({
        name,
        said: samplePicture(name).line,
        seen: [1, 1, 0],
      }))
    );
  });

  it("deals the board in the build, holds one beat of nothing, and lands the title on the hit's frame with the pot after it", () => {
    const beats = SAMPLE_NAMES.map((name) => {
      const layers = layersOf(name);

      const seenAt = (role: string) =>
        layers.filter((layer) => layer.role === role).map(firstSeen);

      const board = [...seenAt("board"), ...seenAt("lifted")];

      return {
        boardInTheBuild: board.every(
          (ms) => ms >= SHORT_CLIP.boardMs && ms < SHORT_CLIP.pauseMs
        ),
        name,
        nothingStartsInThePause: layers.every((layer) => {
          const seen = firstSeen(layer);

          return (
            seen < SHORT_CLIP.pauseMs || seen >= SHORT_CLIP.hitMs - TWO_FRAMES
          );
        }),
        pot: seenAt("pot").every((ms) => ms > SHORT_CLIP.hitMs + STEP),
        title: seenAt("title").map(
          (ms) => ms > SHORT_CLIP.hitMs - TWO_FRAMES && ms <= SHORT_CLIP.hitMs
        ),
      };
    });

    expect(beats).toStrictEqual(
      SAMPLE_NAMES.map((name) => ({
        boardInTheBuild: true,
        name,
        nothingStartsInThePause: true,
        pot: true,
        title: [true],
      }))
    );
  });

  it("ends every sample at rest, the frame the still picture shows, and holds it", () => {
    const ends = SAMPLE_NAMES.map((name) => ({
      held:
        SHORT_CLIP.lengthMs - Math.max(...layersOf(name).map(lastMoved)) >=
        HELD_MS,
      name,
    }));

    expect(ends).toStrictEqual(
      SAMPLE_NAMES.map((name) => ({ held: true, name }))
    );
  });

  it("scores itself in order: the pause, the hit, the result, and no ident after a card that is already there", () => {
    const sheet = shortSheet({ cards: 5, outcome: "Loss", seed: 3 });

    expect({
      cuesInTheBuild: sheet.cues
        .filter((cue) => cue.kind === "Card")
        .every((cue) => cue.atMs < SHORT_CLIP.pauseMs),
      ordered:
        (sheet.pauseMs ?? 0) < (sheet.hitMs ?? 0) &&
        (sheet.hitMs ?? 0) < sheet.resultMs &&
        sheet.resultMs < sheet.lengthMs,
      tagAtTheEnd: sheet.tagMs === sheet.lengthMs,
    }).toStrictEqual({
      cuesInTheBuild: true,
      ordered: true,
      tagAtTheEnd: true,
    });
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

  it("draws a part at rest exactly where the picture has it", () => {
    const layer: Layer = {
      band: 0,
      cell: { height: 40, width: 120, x: 300, y: 500 },
      centre: { x: 361.5, y: 519.25 },
      from: 0,
      index: 0,
      keys: [],
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
      from: 0,
      index: 0,
      keys: [],
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
