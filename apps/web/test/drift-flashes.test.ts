import { describe, expect, it } from "@effect/vitest";
import { replayOf } from "@nostakes/room";
import { Option } from "effect";

import {
  REPLAY_HAND_NAMES,
  replayHand,
} from "../scripts/moments/replay-hands.js";
import { CLIP_FPS } from "../src/features/moments/clip-plan.js";
import {
  CENTRE,
  FRAME,
  redShareOf,
} from "../src/features/moments/drift/art.js";
import {
  FLASH_LIMIT,
  SATURATED_RED,
  flashesIn,
} from "../src/features/moments/drift/flashes.js";
import type { PaintedFilm } from "../src/features/moments/drift/flashes.js";
import { driftPlan } from "../src/features/moments/drift/plan.js";
import { driftTold } from "../src/features/moments/drift/told.js";
import { replaySeatsOf } from "../src/features/moments/replay-plan.js";
import { shownMomentOf } from "../src/features/moments/scene.js";
import { REST } from "../src/features/moments/timeline.js";
import { RED } from "../src/features/pictures/paper.js";

const filmed = (name: string, theme: "Dark" | "Light", calm: boolean) => {
  const hand = replayHand(name, { deck: "TwoColour", theme });
  const found = shownMomentOf(hand);
  const replay = replayOf(hand.record);

  if (Option.isNone(found) || Option.isNone(replay)) {
    return [];
  }

  const plan = driftPlan(
    driftTold(replay.value, {
      kind: found.value.picture.kind,
      principals: found.value.seats,
      seats: replaySeatsOf(hand),
      title: found.value.picture.title,
    }),
    { calm, deck: "TwoColour", kept: { shows: [], svg: "" }, seed: 7, theme }
  );

  const film: PaintedFilm = {
    camera: plan.camera,
    fps: CLIP_FPS,
    height: FRAME.height,
    length: plan.length,
    shots: plan.shots,
    width: FRAME.width,
  };

  return [{ calm, film, name, theme }];
};

const films = REPLAY_HAND_NAMES.flatMap((name) => [
  ...filmed(name, "Light", false),
  ...filmed(name, "Dark", false),
  ...filmed(name, "Light", true),
]);

const STROBE_FRAMES = 30;

const strobed = (film: PaintedFilm): PaintedFilm => ({
  ...film,
  shots: [
    ...film.shots,
    {
      art: "",
      box: { height: FRAME.height, width: FRAME.width, x: 0, y: 0 },
      keys: Array.from({ length: STROBE_FRAMES }, (_, frame) => ({
        at: 2000 + (frame * 1000) / CLIP_FPS,
        ease: "Hold" as const,
        pose: { ...REST, opacity: frame % 4 < 2 ? 1 : 0 },
      })),
      paint: { cover: 1, luminance: 0 },
      pinned: true,
      pivot: CENTRE,
    },
  ],
});

describe("a Drift clip's flashing", () => {
  it("stays within three flashes a second, over the whole frame and over any ninth of it, in every sample hand, both themes, and the calm cut", () => {
    expect(films).toHaveLength(REPLAY_HAND_NAMES.length * 3);
    expect(
      films.flatMap(({ calm, film, name, theme }) => {
        const flashes = flashesIn(film);

        return flashes.whole > FLASH_LIMIT || flashes.region > FLASH_LIMIT
          ? [{ calm, flashes, name, theme }]
          : [];
      })
    ).toStrictEqual([]);
  });

  it("is caught when a strobe is planted in it", () => {
    const [first] = films;

    expect(
      first === undefined ? 0 : flashesIn(strobed(first.film)).whole
    ).toBeGreaterThan(FLASH_LIMIT);
  });

  it("uses no saturated red, which has a stricter limit", () => {
    expect(redShareOf(RED)).toBeLessThan(SATURATED_RED);
  });
});
