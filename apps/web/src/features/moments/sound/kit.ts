import {
  contoured,
  filtered,
  glide,
  held,
  hertz,
  hiss,
  plucked,
  ramp,
  scaled,
  spliced,
  steady,
  struck,
  summed,
  tone,
} from "./dsp.js";
import type { Chance, Curve, Mono, Pass } from "./dsp.js";

export const thump = (high: number, low: number, seconds: number): Mono =>
  contoured(
    tone("Sine", glide(high, low, seconds * 0.45), seconds),
    struck(0.002, seconds)
  );

export const tick = (
  chance: Chance,
  centre: number,
  seconds: number,
  resonance = 2
): Mono =>
  contoured(
    filtered(hiss(seconds, chance), "Band", steady(centre), resonance),
    struck(0.0005, seconds)
  );

export const air = (
  chance: Chance,
  pass: Pass,
  cutoff: Curve,
  seconds: number,
  resonance = 1
): Mono => filtered(hiss(seconds, chance), pass, cutoff, resonance);

export const kick = (chance: Chance, weight: number): Mono =>
  summed([
    scaled(thump(118, 46, 0.3), weight),
    scaled(
      contoured(
        tone("Triangle", glide(260, 120, 0.05), 0.09),
        struck(0.001, 0.08)
      ),
      0.6
    ),
    scaled(tick(chance, 2600, 0.012, 1), 0.4),
  ]);

const BELL_PARTIALS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [2.76, 0.42, 0.55],
  [5.4, 0.2, 0.3],
  [8.93, 0.1, 0.18],
];

export const bell = (frequency: number, seconds: number): Mono =>
  summed(
    BELL_PARTIALS.map(([ratio, level, ring]) =>
      scaled(
        contoured(
          tone("Sine", steady(frequency * ratio), seconds * ring),
          struck(0.002, seconds * ring)
        ),
        level
      )
    )
  );

export const strings = (
  midis: readonly number[],
  seconds: number,
  look: {
    readonly attack: number;
    readonly cutoff: Curve;
    readonly release: number;
  }
): Mono =>
  contoured(
    filtered(
      summed(
        midis.flatMap((midi) => [
          tone("Saw", steady(hertz(midi) * 1.004), seconds),
          tone("Saw", steady(hertz(midi) * 0.996), seconds),
        ])
      ),
      "Low",
      look.cutoff,
      0.8
    ),
    held(
      look.attack,
      Math.max(0, seconds - look.attack - look.release),
      look.release
    )
  );

export const brass = (
  midi: number,
  seconds: number,
  look: { readonly bright: number; readonly fall: number }
): Mono => {
  const pitch = hertz(midi);

  const bend: Curve = (time) =>
    pitch *
    (time < seconds * 0.6
      ? 1
      : 2 ** ((-look.fall * (time - seconds * 0.6)) / (seconds * 0.4) / 12));

  return contoured(
    filtered(
      summed([
        tone("Saw", bend, seconds),
        scaled(
          tone("Square", (time) => bend(time) / 2, seconds),
          0.5
        ),
      ]),
      "Low",
      (time) => 300 + look.bright * Math.exp(-time * 2.2) + look.bright * 0.25,
      1.1
    ),
    held(0.03, Math.max(0, seconds - 0.2), 0.17)
  );
};

const KEY_PARTIALS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [2.003, 0.5, 0.7],
  [3.009, 0.26, 0.5],
  [4.02, 0.12, 0.35],
  [5.04, 0.06, 0.25],
];

export const keys = (midi: number, seconds: number, chance: Chance): Mono =>
  summed([
    ...KEY_PARTIALS.map(([ratio, level, ring]) =>
      scaled(
        contoured(
          tone("Sine", steady(hertz(midi) * ratio), seconds * ring),
          struck(0.003, seconds * ring)
        ),
        level
      )
    ),
    scaled(tick(chance, 2400, 0.012, 0.8), 0.25),
  ]);

export const string = (
  midi: number,
  seconds: number,
  chance: Chance,
  bright = 0.55
): Mono =>
  contoured(
    plucked(hertz(midi), seconds, { bright, chance, ring: seconds * 0.5 }),
    held(0.001, Math.max(0, seconds - 0.05), 0.045)
  );

export const upright = (midi: number, seconds: number, chance: Chance): Mono =>
  summed([
    scaled(
      plucked(hertz(midi), seconds, {
        bright: 0.22,
        chance,
        ring: seconds * 0.45,
      }),
      1.4
    ),
    scaled(
      contoured(
        tone("Sine", steady(hertz(midi)), seconds),
        struck(0.004, seconds * 0.8)
      ),
      0.55
    ),
    scaled(
      contoured(
        tone("Triangle", steady(hertz(midi) * 2), seconds),
        struck(0.004, seconds * 0.5)
      ),
      0.3
    ),
    scaled(tick(chance, 900, 0.02, 0.8), 0.35),
  ]);

export const riser = (chance: Chance, seconds: number, top: number): Mono =>
  contoured(
    summed([
      air(chance, "Band", glide(350, top, seconds), seconds, 1.4),
      scaled(
        filtered(
          tone("Saw", glide(hertz(50), hertz(62), seconds), seconds),
          "Low",
          ramp(400, 2600, seconds),
          1
        ),
        0.4
      ),
    ]),
    (time) =>
      time > seconds - 0.03
        ? Math.max(0, (seconds - time) / 0.03)
        : (time / seconds) ** 2
  );

export interface SmallLook {
  readonly card: number;
  readonly chipHigh: number;
  readonly chipLow: number;
  readonly knock: number;
}

export const cardSnap = (chance: Chance, look: SmallLook): Mono =>
  summed([
    scaled(tick(chance, look.card, 0.02, 3), 0.9),
    scaled(
      contoured(
        air(
          chance,
          "Band",
          glide(look.card * 0.45, look.card * 0.9, 0.06),
          0.07,
          1.4
        ),
        struck(0.002, 0.07)
      ),
      0.4
    ),
    scaled(thump(190, 110, 0.05), 0.35),
  ]);

export const chipRun = (
  chance: Chance,
  look: SmallLook,
  count: number
): Mono => {
  const parts: { at: number; sound: Mono }[] = [];
  let when = 0;

  for (let index = 0; index < count; index += 1) {
    const pitch = look.chipLow + chance() * (look.chipHigh - look.chipLow);

    parts.push({
      at: when,
      sound: summed([
        scaled(tick(chance, pitch, 0.045, 7), 0.8),
        scaled(
          contoured(
            tone("Sine", glide(pitch * 0.8, pitch * 0.76, 0.05), 0.05),
            struck(0.001, 0.05)
          ),
          0.1
        ),
      ]),
    });
    when += 0.022 + chance() * 0.045;
  }

  return spliced(parts);
};

export const knock = (chance: Chance, look: SmallLook): Mono => {
  const one = () =>
    summed([
      thump(look.knock, look.knock * 0.66, 0.07),
      scaled(tick(chance, 650, 0.03, 0.8), 0.5),
    ]);

  return spliced([
    { at: 0, sound: one() },
    { at: 0.12, sound: scaled(one(), 0.8) },
  ]);
};

export const swish = (chance: Chance): Mono =>
  contoured(
    air(chance, "Band", glide(1500, 480, 0.2), 0.2, 1.2),
    held(0.05, 0.04, 0.11)
  );

export const blip = (from: number, to: number): Mono =>
  contoured(tone("Sine", glide(from, to, 0.05), 0.08), struck(0.004, 0.08));

export const stamp = (chance: Chance): Mono =>
  summed([thump(170, 68, 0.12), scaled(tick(chance, 700, 0.03, 1), 0.4)]);
