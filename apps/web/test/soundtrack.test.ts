import { describe, expect, it } from "@effect/vitest";

import {
  SOUND_RATE,
  integratedLoudness,
  peakOf,
} from "../src/features/moments/sound/dsp.js";
import type { Stereo } from "../src/features/moments/sound/dsp.js";
import {
  LOUDNESS_TARGET,
  PALETTES,
  PEAK_CEILING,
} from "../src/features/moments/sound/sheet.js";
import type { ScoreSheet } from "../src/features/moments/sound/sheet.js";
import { soundtrackOf } from "../src/features/moments/sound/soundtrack.js";
import { TABLE_STAGING, planFor } from "../src/features/moments/timeline.js";

const SHEET: ScoreSheet = {
  cues: [
    { atMs: 1900, kind: "AllIn", pan: -0.4 },
    { atMs: 3100, kind: "Card", pan: 0 },
    { atMs: 3340, kind: "Bar", pan: 0 },
    { atMs: 8200, kind: "Card", pan: 0 },
    { atMs: 9300, kind: "Chips", pan: 0.4 },
  ],
  hitMs: 6400,
  lengthMs: 11_700,
  outcome: "Loss",
  pauseMs: 4100,
  resultMs: 8200,
  seed: 31,
  tagMs: 9300,
};

const decibels = (level: number) => 20 * Math.log10(Math.max(level, 1e-9));

const levelBetween = (mix: Stereo, from: number, to: number) => {
  const start = Math.round((from / 1000) * SOUND_RATE);
  const end = Math.round((to / 1000) * SOUND_RATE);
  let total = 0;

  for (let index = start; index < end; index += 1) {
    total += (mix.left[index] ?? 0) ** 2 + (mix.right[index] ?? 0) ** 2;
  }

  return decibels(Math.sqrt(total / Math.max(1, (end - start) * 2)));
};

const FRAME_MS = 1000 / 30;

const measured = PALETTES.map((palette) => {
  const mix = soundtrackOf(SHEET, palette);
  const pause = SHEET.pauseMs ?? 0;
  const hit = SHEET.hitMs ?? 0;

  return {
    build: levelBetween(mix, pause - 1500, pause - 100),
    hit: levelBetween(mix, hit, hit + FRAME_MS),
    justBefore: levelBetween(mix, hit - 100, hit - 2),
    loudness: integratedLoudness(mix),
    mix,
    palette,
    pause: levelBetween(mix, pause + 400, hit - 50),
    peak: decibels(peakOf(mix)),
  };
});

describe("a replay's soundtrack, in every palette", () => {
  it("is mastered near the loudness social apps play at, under the peak ceiling", () => {
    expect(
      measured.filter(
        ({ loudness, peak }) =>
          Math.abs(loudness - LOUDNESS_TARGET) > 1.5 ||
          peak > PEAK_CEILING + 0.1
      )
    ).toStrictEqual([]);
  });

  it("drops at least 20 dB for the pause", () => {
    expect(
      measured
        .filter(({ build, pause }) => build - pause < 20)
        .map(({ build, palette, pause }) => ({ build, palette, pause }))
    ).toStrictEqual([]);
  });

  it("lands the hit inside the frame the plan names, out of near silence", () => {
    expect(
      measured
        .filter(({ hit, justBefore }) => hit - justBefore < 20)
        .map(({ hit, justBefore, palette }) => ({ hit, justBefore, palette }))
    ).toStrictEqual([]);
  });

  it("mixes the same sheet to the same samples", () => {
    const [first] = measured;
    const again = soundtrackOf(SHEET, "Broadcast");

    expect(
      first?.mix.left.every((sample, at) => sample === again.left[at])
    ).toBe(true);
  });
});

describe("the table's own staging of a moment", () => {
  it("stays as fast as it was, whatever a clip does", () => {
    expect({
      holds: [
        planFor("Celebration", 1),
        planFor("Groan", 3),
        planFor("Reveal", 2),
        planFor("Relief", 1),
      ],
      staging: {
        landed: [...TABLE_STAGING.landed],
        spread: TABLE_STAGING.spread,
      },
    }).toStrictEqual({
      holds: [
        { hold: 1600, leave: 280 },
        { hold: 2800, leave: 280 },
        { hold: 2400, leave: 280 },
        { hold: 1600, leave: 280 },
      ],
      staging: { landed: [], spread: 1 },
    });
  });
});
