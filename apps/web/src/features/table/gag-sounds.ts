import type { Reaction } from "@nostakes/room";

import {
  chanceFrom,
  contoured,
  filtered,
  glide,
  hiss,
  held,
  ramp,
  scaled,
  spliced,
  steady,
  struck,
  summed,
  tone,
} from "../moments/sound/dsp.js";
import type { Mono } from "../moments/sound/dsp.js";

export const whoosh = (seconds: number, seed = 3): Mono =>
  scaled(
    contoured(
      filtered(
        hiss(seconds + 0.05, chanceFrom(seed)),
        "Band",
        glide(420, 2600, seconds),
        1.6
      ),
      (time) => Math.sin(Math.PI * Math.min(1, time / (seconds + 0.05))) ** 2
    ),
    0.32
  );

const slapOnce = (seed: number): Mono =>
  scaled(
    contoured(
      filtered(hiss(0.07, chanceFrom(seed)), "High", steady(1300), 0.9),
      struck(0.0008, 0.05)
    ),
    0.85
  );

const slap = (): Mono =>
  spliced([
    { at: 0.18, sound: slapOnce(31) },
    { at: 0.47, sound: slapOnce(32) },
  ]);

const sizzle = (): Mono => {
  const crackle = chanceFrom(41);

  return summed([
    scaled(
      contoured(
        filtered(hiss(0.9, chanceFrom(42)), "High", steady(3800), 0.8),
        (time) => held(0.02, 0.45, 0.4)(time) * (crackle() > 0.92 ? 1 : 0.35)
      ),
      0.4
    ),
    scaled(
      contoured(
        filtered(hiss(0.25, chanceFrom(43)), "Band", glide(500, 1800, 0.2), 1),
        struck(0.004, 0.2)
      ),
      0.45
    ),
  ]);
};

const drain = (): Mono =>
  scaled(
    contoured(
      summed([
        tone("Triangle", glide(520, 130, 0.7), 0.8),
        scaled(tone("Sine", glide(260, 65, 0.7), 0.8), 0.6),
      ]),
      held(0.01, 0.5, 0.29)
    ),
    0.35
  );

const giggle = (): Mono =>
  spliced(
    [0, 0.11, 0.2, 0.28, 0.35].map((at, index) => ({
      at,
      sound: scaled(
        contoured(
          tone(
            "Triangle",
            ramp(620 - index * 40, 480 - index * 40, 0.08),
            0.09
          ),
          struck(0.004, 0.08)
        ),
        0.3
      ),
    }))
  );

const clapOnce = (seed: number): Mono =>
  summed([
    scaled(
      contoured(
        filtered(hiss(0.06, chanceFrom(seed)), "Band", steady(1250), 1.1),
        struck(0.0006, 0.045)
      ),
      0.8
    ),
    scaled(
      contoured(
        filtered(hiss(0.03, chanceFrom(seed + 1)), "High", steady(3200), 0.8),
        struck(0.0004, 0.02)
      ),
      0.35
    ),
  ]);

const clap = (): Mono =>
  spliced(
    [0.29, 0.58, 0.86].map((at, index) => ({
      at,
      sound: clapOnce(70 + index * 2),
    }))
  );

const dwoop = (): Mono =>
  spliced([
    {
      at: 0,
      sound: scaled(
        contoured(
          tone("Triangle", glide(980, 260, 0.32), 0.36),
          held(0.01, 0.25, 0.1)
        ),
        0.4
      ),
    },
    {
      at: 0.1,
      sound: scaled(
        contoured(
          tone("Sine", glide(1960, 520, 0.3), 0.32),
          held(0.01, 0.2, 0.1)
        ),
        0.12
      ),
    },
  ]);

const drop = (seed: number): Mono =>
  scaled(
    contoured(
      tone("Sine", glide(1700 + seed * 37, 900, 0.04), 0.05),
      struck(0.001, 0.04)
    ),
    0.22
  );

const patter = (): Mono =>
  spliced([
    { at: 0, sound: scaled(drain(), 0.5) },
    ...[0, 1, 2, 3, 4, 5].map((index) => ({
      at: 0.25 + index * 0.14,
      sound: drop(index),
    })),
  ]);

const blip = (from: number, to: number): Mono =>
  scaled(
    contoured(tone("Sine", glide(from, to, 0.07), 0.09), struck(0.003, 0.08)),
    0.4
  );

const peek = (): Mono =>
  spliced([
    { at: 0.08, sound: blip(420, 900) },
    { at: 0.62, sound: scaled(blip(1100, 1100), 0.5) },
    { at: 0.98, sound: scaled(blip(1100, 1100), 0.5) },
    { at: 1.25, sound: blip(900, 300) },
  ]);

const boing = (): Mono =>
  scaled(
    contoured(
      tone(
        "Sine",
        (time) =>
          (170 + 330 * Math.min(1, time / 0.15)) *
          (1 + 0.07 * Math.sin(2 * Math.PI * 16 * time)),
        0.22
      ),
      held(0.005, 0.12, 0.09)
    ),
    0.32
  );

const honk = (pitch: number, seconds: number): Mono =>
  scaled(
    contoured(
      filtered(
        tone(
          "Saw",
          (time) => pitch * (1 + 0.025 * Math.sin(2 * Math.PI * 7 * time)),
          seconds
        ),
        "Band",
        steady(1050),
        2.4
      ),
      held(0.006, seconds - 0.05, 0.04)
    ),
    0.55
  );

const raspberry = (): Mono =>
  summed([
    scaled(
      contoured(
        filtered(
          tone("Saw", glide(105, 80, 0.3), 0.3),
          "Band",
          steady(640),
          1.3
        ),
        (time) =>
          (0.5 + 0.5 * Math.sin(2 * Math.PI * 31 * time)) *
          held(0.01, 0.2, 0.09)(time)
      ),
      0.6
    ),
    scaled(
      contoured(
        filtered(hiss(0.3, chanceFrom(91)), "Band", steady(1500), 0.9),
        (time) =>
          (0.5 + 0.5 * Math.sin(2 * Math.PI * 31 * time)) *
          held(0.01, 0.2, 0.09)(time)
      ),
      0.18
    ),
  ]);

const blat = (): Mono =>
  spliced([
    { at: 0, sound: boing() },
    { at: 0.36, sound: honk(233, 0.1) },
    { at: 0.57, sound: honk(262, 0.1) },
    { at: 0.78, sound: honk(311, 0.16) },
    { at: 1, sound: raspberry() },
  ]);

export const GAG_SOUNDS: Readonly<Record<Reaction, () => Mono>> = {
  Bird: blat,
  Clap: clap,
  Cry: patter,
  Dead: drain,
  Eyes: peek,
  Fire: sizzle,
  Fish: slap,
  Laugh: giggle,
  Wow: dwoop,
};
