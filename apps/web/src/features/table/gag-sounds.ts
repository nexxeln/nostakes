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

const pap = (seed: number): Mono =>
  scaled(
    contoured(
      filtered(hiss(0.05, chanceFrom(seed)), "Band", steady(2200), 1.4),
      struck(0.0006, 0.035)
    ),
    0.5
  );

const pelt = (): Mono =>
  spliced([
    { at: 0, sound: giggle() },
    ...[0, 1, 2, 3, 4].map((index) => ({
      at: 0.29 + index * 0.15,
      sound: pap(110 + index),
    })),
  ]);

const slowClaps = (): Mono =>
  spliced(
    [0.42, 0.81, 1.2].map((at, index) => ({
      at,
      sound: clapOnce(80 + index * 2),
    }))
  );

const thud = (): Mono =>
  summed([
    scaled(
      contoured(tone("Sine", glide(140, 55, 0.12), 0.18), struck(0.002, 0.14)),
      0.7
    ),
    scaled(
      contoured(
        filtered(hiss(0.04, chanceFrom(121)), "Band", steady(1800), 1),
        struck(0.0005, 0.025)
      ),
      0.4
    ),
  ]);

const stamped = (): Mono =>
  spliced([
    { at: 0, sound: dwoop() },
    { at: 0.13, sound: thud() },
  ]);

const fiddle = (pitch: number, seconds: number): Mono =>
  scaled(
    contoured(
      filtered(
        filtered(
          tone(
            "Saw",
            (time) =>
              pitch *
              (1 +
                0.012 *
                  Math.min(1, time / 0.12) *
                  Math.sin(2 * Math.PI * 5.8 * time)),
            seconds
          ),
          "Band",
          steady(pitch * 2),
          0.9
        ),
        "High",
        steady(500),
        0.7
      ),
      held(0.05, seconds - 0.11, 0.06)
    ),
    0.5
  );

const tinyViolin = (): Mono =>
  scaled(
    spliced([
      { at: 0.14, sound: fiddle(880, 0.3) },
      { at: 0.42, sound: fiddle(784, 0.3) },
      { at: 0.7, sound: fiddle(698.5, 0.3) },
      { at: 0.98, sound: fiddle(659.3, 0.42) },
    ]),
    0.55
  );

const toll = (): Mono =>
  summed([
    contoured(tone("Sine", steady(196), 1.1), struck(0.004, 1)),
    scaled(
      contoured(tone("Sine", steady(196 * 2.4), 0.6), struck(0.003, 0.5)),
      0.35
    ),
    scaled(
      contoured(tone("Sine", steady(196 * 3.9), 0.4), struck(0.002, 0.3)),
      0.15
    ),
  ]);

const buried = (): Mono =>
  spliced([
    { at: 0.15, sound: thud() },
    { at: 0.32, sound: scaled(toll(), 0.3) },
  ]);

const gulp = (): Mono =>
  scaled(
    contoured(
      tone("Sine", glide(330, 140, 0.12), 0.16),
      held(0.005, 0.08, 0.07)
    ),
    0.4
  );

const stare = (): Mono =>
  spliced([
    { at: 0.05, sound: blip(420, 900) },
    { at: 0.55, sound: gulp() },
    { at: 0.96, sound: scaled(blip(1100, 1100), 0.5) },
  ]);

const groan = (): Mono =>
  scaled(
    contoured(
      filtered(
        tone("Saw", glide(160, 105, 0.45), 0.5),
        "Band",
        glide(700, 420, 0.45),
        1.6
      ),
      held(0.04, 0.3, 0.16)
    ),
    0.32
  );

const palm = (): Mono =>
  spliced([
    { at: 0.2, sound: slapOnce(141) },
    { at: 0.3, sound: groan() },
  ]);

export const FELT_SOUNDS: Readonly<Record<Reaction, () => Mono>> = {
  Bird: blat,
  Clap: clap,
  Cry: patter,
  Dead: drain,
  Eyes: peek,
  Fire: sizzle,
  Fish: palm,
  Laugh: giggle,
  Wow: dwoop,
};

export const THROWN_SOUNDS: Readonly<Record<Reaction, () => Mono>> = {
  Bird: blat,
  Clap: slowClaps,
  Cry: tinyViolin,
  Dead: buried,
  Eyes: stare,
  Fire: sizzle,
  Fish: slap,
  Laugh: pelt,
  Wow: stamped,
};
