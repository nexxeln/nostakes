import { describe, expect, it } from "@effect/vitest";
import { replayOf } from "@nostakes/room";
import { Option } from "effect";

import {
  REPLAY_HAND_NAMES,
  replayHand,
} from "../scripts/moments/replay-hands.js";
import { CLIP_FPS } from "../src/features/moments/atlas.js";
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
import { reelPartOf, reelPlan } from "../src/features/moments/reel.js";
import { sceneOf } from "../src/features/moments/scene.js";
import { REST } from "../src/features/moments/timeline.js";
import { RED } from "../src/features/pictures/paper.js";

const partOf = (name: string, theme: "Dark" | "Light", calm: boolean) => {
  const hand = replayHand(name, { deck: "TwoColour", theme });
  const scene = sceneOf(hand);
  const replay = replayOf(hand.record);

  return Option.isNone(scene) || Option.isNone(replay)
    ? []
    : [
        reelPartOf({ hand, scene: scene.value }, replay.value, {
          calm,
          deck: "TwoColour",
          theme,
        }),
      ];
};

const painted = (plan: {
  readonly camera: PaintedFilm["camera"];
  readonly length: number;
  readonly shots: PaintedFilm["shots"];
}): PaintedFilm => ({
  camera: plan.camera,
  fps: CLIP_FPS,
  height: FRAME.height,
  length: plan.length,
  shots: plan.shots,
  width: FRAME.width,
});

const filmed = (name: string, theme: "Dark" | "Light", calm: boolean) =>
  partOf(name, theme, calm).map((plan) => ({
    calm,
    film: painted(plan),
    name,
    theme,
  }));

const REEL_PAIRS = [
  ["AcesCracked", "HeroCall"],
  ["AllInBluff", "QuadsIntoBoat"],
] as const;

const reels = REEL_PAIRS.flatMap(([first, second]) =>
  (["Light", "Dark"] as const).flatMap((theme) =>
    [false, true].map((calm) => ({
      calm,
      film: painted(
        reelPlan(
          [...partOf(first, theme, calm), ...partOf(second, theme, calm)],
          { svg: "" }
        )
      ),
      name: `${first} then ${second}`,
      theme,
    }))
  )
);

const films = [
  ...REPLAY_HAND_NAMES.flatMap((name) => [
    ...filmed(name, "Light", false),
    ...filmed(name, "Dark", false),
    ...filmed(name, "Light", true),
  ]),
  ...reels,
];

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

describe("the night reel's flashing", () => {
  it("stays within three flashes a second, over the whole frame and over any ninth of it, in every sample hand's part, whole reels with their end card, both themes, and the calm cut", () => {
    expect(films).toHaveLength(
      REPLAY_HAND_NAMES.length * 3 + REEL_PAIRS.length * 4
    );
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
