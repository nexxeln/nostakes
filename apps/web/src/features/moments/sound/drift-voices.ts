import {
  SOUND_RATE,
  contoured,
  driven,
  filtered,
  glide,
  held,
  hertz,
  hiss,
  scaled,
  spliced,
  steady,
  struck,
  summed,
  tone,
} from "./dsp.js";
import type { Chance, Mono, Stereo } from "./dsp.js";
import { thump, tick } from "./kit.js";

const HAT_LEVEL = 2;

export const hat = (chance: Chance, seconds: number): Mono =>
  scaled(
    contoured(
      filtered(hiss(seconds, chance), "High", steady(7600), 0.9),
      struck(0.0008, seconds)
    ),
    HAT_LEVEL
  );

const CLAP_BURSTS = [
  { at: 0, seconds: 0.02 },
  { at: 0.011, seconds: 0.02 },
  { at: 0.023, seconds: 0.16 },
];

export const clap = (chance: Chance): Mono =>
  spliced(
    CLAP_BURSTS.map((burst) => ({
      at: burst.at,
      sound: contoured(
        filtered(hiss(burst.seconds, chance), "Band", steady(1700), 0.8),
        (time) => 1.8 * struck(0.0005, burst.seconds * 0.9)(time)
      ),
    }))
  );

export const snare = (chance: Chance): Mono =>
  summed([
    contoured(
      filtered(hiss(0.16, chance), "Band", steady(2400), 0.8),
      struck(0.0005, 0.13)
    ),
    scaled(thump(250, 170, 0.08), 0.6),
  ]);

export const crash = (chance: Chance, seconds: number): Mono =>
  contoured(
    filtered(hiss(seconds, chance), "High", steady(4200), 0.8),
    struck(0.002, seconds)
  );

export const boom = (seconds: number): Mono =>
  contoured(
    driven(tone("Sine", glide(140, 30, seconds * 0.6), seconds), 2),
    struck(0.004, seconds)
  );

export const suckIn = (chance: Chance, seconds: number): Mono =>
  contoured(
    filtered(hiss(seconds, chance), "Band", glide(900, 7000, seconds), 1.2),
    (time) => (time / seconds) ** 3
  );

export const cowbell = (midi: number, seconds: number, drive: number): Mono => {
  const pitch = hertz(midi);

  return contoured(
    driven(
      filtered(
        summed([
          tone("Square", steady(pitch), seconds),
          scaled(tone("Square", steady(pitch * 1.48), seconds), 0.8),
        ]),
        "Band",
        steady(pitch * 1.7),
        1.6
      ),
      drive
    ),
    struck(0.001, seconds)
  );
};

export const slap808 = (midi: number, seconds: number, drive: number): Mono =>
  contoured(
    filtered(
      driven(
        tone(
          "Sine",
          (time) => hertz(midi) * (1 + 1.2 * Math.exp(-time * 40)),
          seconds
        ),
        drive
      ),
      "Low",
      steady(1900)
    ),
    held(0.002, seconds * 0.65, seconds * 0.33)
  );

export const shortKick = (chance: Chance, top: number): Mono =>
  summed([
    contoured(
      driven(tone("Sine", glide(top, 48, 0.09), 0.22), 2.5),
      struck(0.001, 0.2)
    ),
    scaled(tick(chance, 3200, 0.01, 1), 0.5),
  ]);

export const counter = (seconds: number, steps: number): Mono =>
  spliced(
    Array.from({ length: steps }, (_, index) => ({
      at: (index * seconds) / steps,
      sound: scaled(
        contoured(
          tone("Square", steady(1100 * 2 ** (index / steps)), 0.03),
          struck(0.001, 0.028)
        ),
        0.5
      ),
    }))
  );

const eachChannel = (mix: Stereo) => [mix.left, mix.right];

export const tapeStopped = (mix: Stereo, from: number, seconds: number) => {
  const start = Math.round(from * SOUND_RATE);
  const length = Math.round(seconds * SOUND_RATE);

  for (const channel of eachChannel(mix)) {
    const source = Float32Array.from(channel);
    let read = start;

    for (let index = 0; index < length; index += 1) {
      const left = 1 - index / length;
      const whole = Math.floor(read);
      const part = read - whole;

      channel[start + index] =
        ((source[whole] ?? 0) * (1 - part) + (source[whole + 1] ?? 0) * part) *
        Math.sqrt(left);
      read += left ** 1.6;
    }

    channel.fill(0, start + length);
  }
};

export const repeated = (
  mix: Stereo,
  from: number,
  slice: number,
  times: number
) => {
  const start = Math.round(from * SOUND_RATE);
  const length = Math.round(slice * SOUND_RATE);
  const fade = Math.round(0.003 * SOUND_RATE);

  for (const channel of eachChannel(mix)) {
    const piece = channel.slice(start, start + length);

    for (let index = 0; index < fade; index += 1) {
      piece[length - 1 - index] =
        ((piece[length - 1 - index] ?? 0) * index) / fade;
    }

    for (let turn = 1; turn < times; turn += 1) {
      channel.set(
        piece.subarray(0, Math.max(0, channel.length - start - turn * length)),
        start + turn * length
      );
    }
  }
};

export const ducked = (
  mix: Stereo,
  hits: readonly number[],
  pump: { readonly depth: number; readonly release: number }
) => {
  const gains = new Float32Array(mix.left.length).fill(1);
  const reach = Math.round(pump.release * 5 * SOUND_RATE);

  for (const hit of hits) {
    const start = Math.round(hit * SOUND_RATE);

    for (let index = 0; index < reach; index += 1) {
      const dip =
        1 - pump.depth * Math.exp(-index / (pump.release * SOUND_RATE));

      gains[start + index] = Math.min(gains[start + index] ?? 1, dip);
    }
  }

  for (const channel of eachChannel(mix)) {
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = (channel[index] ?? 0) * (gains[index] ?? 1);
    }
  }
};

export const silenced = (mix: Stereo, from: number, to: number) => {
  const fade = Math.round(0.004 * SOUND_RATE);
  const start = Math.round(from * SOUND_RATE);
  const end = Math.round(to * SOUND_RATE);

  for (const channel of eachChannel(mix)) {
    for (let index = 0; index < fade; index += 1) {
      const at = start - fade + index;

      channel[at] = (channel[at] ?? 0) * (1 - index / fade);
    }

    channel.fill(0, start, end);
  }
};

export const saturated = (mix: Stereo, drive: number) => {
  const even = 1 / Math.tanh(drive);

  for (const channel of eachChannel(mix)) {
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.tanh((channel[index] ?? 0) * drive) * even;
    }
  }
};
