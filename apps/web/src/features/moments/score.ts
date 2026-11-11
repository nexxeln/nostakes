import type { MomentKind, Tier } from "@nostakes/room";

export type Wave = "sine" | "triangle";

export type SoundStep =
  | {
      readonly at: number;
      readonly dur: number;
      readonly from: number;
      readonly gain: number;
      readonly kind: "Tone";
      readonly to: number;
      readonly wave: Wave;
    }
  | {
      readonly at: number;
      readonly dur: number;
      readonly freq: number;
      readonly gain: number;
      readonly kind: "Burst";
      readonly q: number;
      readonly sweepTo: number;
    };

export type Family = "Celebration" | "Reveal" | "Groan" | "Relief";

export const FAMILIES: Readonly<Record<MomentKind, Family>> = {
  BadBeat: "Groan",
  BigHand: "Celebration",
  Bluff: "Reveal",
  Cooler: "Groan",
  HeroCall: "Reveal",
  SameHand: "Relief",
  SevenDeuce: "Celebration",
  SplitRuns: "Relief",
  Suckout: "Celebration",
};

export const LONGEST_SCORE_SECONDS = 2;

const tone = (
  at: number,
  from: number,
  dur: number,
  gain: number,
  wave: Wave = "triangle",
  to = from
): SoundStep => ({ at, dur, from, gain, kind: "Tone", to, wave });

const burst = (
  at: number,
  freq: number,
  dur: number,
  gain: number,
  q: number,
  sweepTo = freq
): SoundStep => ({ at, dur, freq, gain, kind: "Burst", q, sweepTo });

export const chips = (
  at: number,
  count: number,
  soft: number,
  seed: number
): readonly SoundStep[] => {
  let state = seed;
  let when = at;
  const steps: SoundStep[] = [];

  for (let index = 0; index < count; index += 1) {
    state = (state * 48_271) % 2_147_483_647;
    const freq = 2600 + (state % 2600);

    steps.push(
      burst(when, freq, 0.045, 0.35 * soft, 7),
      tone(when, freq * 0.8, 0.05, 0.035 * soft, "sine", freq * 0.76)
    );
    state = (state * 48_271) % 2_147_483_647;
    when += 0.022 + (state % 45) / 1000;
  }

  return steps;
};

const slap = (at: number): readonly SoundStep[] => [
  tone(at, 150, 0.12, 0.45, "sine", 60),
  burst(at, 700, 0.06, 0.32, 0.9, 260),
];

export const flip = (at: number): readonly SoundStep[] => [
  burst(at, 3200, 0.02, 0.3, 4),
  burst(at + 0.015, 1400, 0.07, 0.12, 1.5, 3000),
];

const sparkle = (at: number, notes: readonly number[]) =>
  notes.map((freq, index) => tone(at + index * 0.06, freq, 0.35, 0.03, "sine"));

const celebration = (tier: Tier): readonly SoundStep[] => [
  ...chips(0, 8, 0.7, 11),
  ...[392, 494, 587].map((freq, index) =>
    tone(0.08 + index * 0.07, freq, 0.7, 0.05)
  ),
  ...(tier >= 2
    ? [
        ...slap(0),
        tone(0.32, 784, 0.9, 0.05),
        ...sparkle(0.42, [1568, 2093, 2637]),
      ]
    : []),
  ...(tier >= 3
    ? [
        ...chips(0.55, 18, 0.8, 29),
        tone(0.62, 98, 0.5, 0.35, "sine", 82),
        ...[523, 659, 784, 1175].map((freq, index) =>
          tone(0.7 + index * 0.05, freq, 1.15, 0.045)
        ),
      ]
    : []),
];

const reveal = (tier: Tier): readonly SoundStep[] => [
  ...flip(0),
  ...flip(0.16),
  tone(0.36, 523, 0.18, 0.05),
  tone(0.52, 659, 0.18, 0.05),
  tone(0.68, 784, 0.55, 0.055, "triangle", 790),
  ...(tier >= 2
    ? [...slap(0.66), ...sparkle(0.78, [1568, 2093]), ...chips(0.7, 6, 0.5, 7)]
    : []),
];

const groan = (tier: Tier): readonly SoundStep[] => [
  tone(0.3, 392, 0.32, 0.05, "triangle", 370),
  tone(0.62, 349, 0.32, 0.05, "triangle", 330),
  tone(0.94, 311, 0.7, 0.05, "triangle", 262),
  ...(tier >= 2
    ? [
        tone(0.3, 196, 0.32, 0.04, "triangle", 185),
        tone(0.62, 175, 0.32, 0.04, "triangle", 165),
        tone(0.94, 156, 0.7, 0.04, "triangle", 131),
      ]
    : []),
  ...(tier >= 3 ? [tone(1.2, 196, 0.75, 0.06, "triangle", 82)] : []),
];

const relief = (): readonly SoundStep[] => [
  ...chips(0, 5, 0.6, 3),
  ...chips(0.18, 5, 0.6, 5),
];

const SIGNATURES: Readonly<Record<MomentKind, readonly SoundStep[]>> = {
  BadBeat: [
    tone(0, 70, 0.16, 0.45, "sine", 45),
    tone(0.2, 64, 0.14, 0.3, "sine", 42),
  ],
  BigHand: [],
  Bluff: [],
  Cooler: [
    tone(0, 2637, 0.6, 0.012, "sine", 2600),
    tone(0.05, 3136, 0.55, 0.01, "sine", 3100),
    tone(0.1, 3951, 0.5, 0.008, "sine", 3900),
  ],
  HeroCall: [
    tone(0.3, 170, 0.09, 0.5, "sine", 70),
    burst(0.3, 600, 0.03, 0.18, 1),
  ],
  SameHand: [tone(0.3, 784, 0.35, 0.05), tone(0.5, 784, 0.6, 0.05)],
  SevenDeuce: [
    tone(0, 392, 0.12, 0.06, "triangle", 392),
    tone(0.12, 294, 0.16, 0.06, "triangle", 290),
  ],
  SplitRuns: [tone(0.3, 659, 0.4, 0.05), tone(0.5, 988, 0.6, 0.045)],
  Suckout: [tone(0, 300, 0.28, 0.05, "sine", 900)],
};

const SCORES: Readonly<Record<Family, (tier: Tier) => readonly SoundStep[]>> = {
  Celebration: celebration,
  Groan: groan,
  Relief: relief,
  Reveal: reveal,
};

export const momentScore = (
  kind: MomentKind,
  tier: Tier
): readonly SoundStep[] => [
  ...SCORES[FAMILIES[kind]](tier),
  ...SIGNATURES[kind],
];

export const STING_HITS: Readonly<Record<Family, number>> = {
  Celebration: 0.08,
  Groan: 0.94,
  Relief: 0.18,
  Reveal: 0.68,
};

export const shiftedScore = (
  steps: readonly SoundStep[],
  seconds: number
): readonly SoundStep[] =>
  steps.map((step) => ({ ...step, at: step.at + seconds }));

export const scoreLength = (steps: readonly SoundStep[]) =>
  Math.max(0, ...steps.map((step) => step.at + step.dur));

export const BUZZES: Readonly<Record<Family, readonly number[]>> = {
  Celebration: [18, 40, 18, 40, 30],
  Groan: [60, 80, 120],
  Relief: [16, 60, 16],
  Reveal: [12, 90, 24],
};
