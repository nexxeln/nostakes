export const SOUND_RATE = 48_000;

const TAU = Math.PI * 2;

export type Mono = Float32Array;

export interface Stereo {
  readonly left: Float32Array;
  readonly right: Float32Array;
}

export const samplesFor = (seconds: number) =>
  Math.max(1, Math.round(seconds * SOUND_RATE));

export const stereoOf = (seconds: number): Stereo => ({
  left: new Float32Array(samplesFor(seconds)),
  right: new Float32Array(samplesFor(seconds)),
});

export const hertz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export const gainOf = (decibels: number) => 10 ** (decibels / 20);

export type Chance = () => number;

export const chanceFrom = (seed: number): Chance => {
  let state = (Math.abs(Math.trunc(seed)) % 2_147_483_646) + 1;

  return () => {
    state = (state * 48_271) % 2_147_483_647;

    return state / 2_147_483_647;
  };
};

export type Curve = (seconds: number) => number;

export const steady =
  (value: number): Curve =>
  () =>
    value;

export const glide =
  (from: number, to: number, seconds: number): Curve =>
  (time) =>
    from * (to / from) ** Math.min(1, Math.max(0, time / seconds));

export const ramp =
  (from: number, to: number, seconds: number): Curve =>
  (time) =>
    from + (to - from) * Math.min(1, Math.max(0, time / seconds));

export type Wave = "Saw" | "Sine" | "Square" | "Triangle";

const blep = (phase: number, step: number) => {
  if (phase < step) {
    const along = phase / step;

    return along + along - along * along - 1;
  }

  if (phase > 1 - step) {
    const along = (phase - 1) / step;

    return along * along + along + along + 1;
  }

  return 0;
};

const waveAt = (wave: Wave, phase: number, step: number) => {
  if (wave === "Sine") {
    return Math.sin(TAU * phase);
  }

  if (wave === "Triangle") {
    return 1 - 4 * Math.abs(phase - 0.5);
  }

  if (wave === "Saw") {
    return 2 * phase - 1 - blep(phase, step);
  }

  return (
    (phase < 0.5 ? 1 : -1) + blep(phase, step) - blep((phase + 0.5) % 1, step)
  );
};

export const tone = (wave: Wave, pitch: Curve, seconds: number): Mono => {
  const out = new Float32Array(samplesFor(seconds));
  let phase = 0;

  for (let index = 0; index < out.length; index += 1) {
    const step = pitch(index / SOUND_RATE) / SOUND_RATE;

    out[index] = waveAt(wave, phase, step);
    phase = (phase + step) % 1;
  }

  return out;
};

export const hiss = (seconds: number, chance: Chance): Mono => {
  const out = new Float32Array(samplesFor(seconds));

  for (let index = 0; index < out.length; index += 1) {
    out[index] = chance() * 2 - 1;
  }

  return out;
};

export const contoured = (sound: Mono, level: Curve): Mono => {
  for (let index = 0; index < sound.length; index += 1) {
    sound[index] = (sound[index] ?? 0) * level(index / SOUND_RATE);
  }

  return sound;
};

export const struck =
  (attack: number, decay: number): Curve =>
  (time) =>
    time < attack
      ? time / attack
      : Math.exp((-(time - attack) * 6.9) / Math.max(0.001, decay));

export const held =
  (attack: number, hold: number, release: number): Curve =>
  (time) => {
    if (time < attack) {
      return time / attack;
    }

    if (time < attack + hold) {
      return 1;
    }

    return Math.max(0, 1 - (time - attack - hold) / Math.max(0.001, release));
  };

export type Pass = "Band" | "High" | "Low";

const CONTROL_EVERY = 16;

export const filtered = (
  sound: Mono,
  pass: Pass,
  cutoff: Curve,
  resonance = Math.SQRT1_2
): Mono => {
  let low = 0;
  let band = 0;
  let turn = 0;
  let damp = 1 / resonance;
  let first = 0;
  let second = 0;
  let third = 0;

  for (let index = 0; index < sound.length; index += 1) {
    if (index % CONTROL_EVERY === 0) {
      const frequency = Math.min(
        SOUND_RATE * 0.45,
        Math.max(20, cutoff(index / SOUND_RATE))
      );

      turn = Math.tan((Math.PI * frequency) / SOUND_RATE);
      damp = 1 / resonance;
      first = 1 / (1 + turn * (turn + damp));
      second = turn * first;
      third = turn * second;
    }

    const input = sound[index] ?? 0;
    const above = input - band;
    const middle = first * low + second * above;
    const below = band + second * low + third * above;

    low = 2 * middle - low;
    band = 2 * below - band;

    if (pass === "Low") {
      sound[index] = below;
    } else if (pass === "Band") {
      sound[index] = middle * damp;
    } else {
      sound[index] = input - damp * middle - below;
    }
  }

  return sound;
};

export const summed = (sounds: readonly Mono[]): Mono => {
  const out = new Float32Array(
    Math.max(1, ...sounds.map((sound) => sound.length))
  );

  for (const sound of sounds) {
    for (let index = 0; index < sound.length; index += 1) {
      out[index] = (out[index] ?? 0) + (sound[index] ?? 0);
    }
  }

  return out;
};

export const spliced = (
  parts: readonly { readonly at: number; readonly sound: Mono }[]
): Mono => {
  const out = new Float32Array(
    Math.max(1, ...parts.map((part) => samplesFor(part.at) + part.sound.length))
  );

  for (const part of parts) {
    const start = Math.round(part.at * SOUND_RATE);

    for (let index = 0; index < part.sound.length; index += 1) {
      out[start + index] = (out[start + index] ?? 0) + (part.sound[index] ?? 0);
    }
  }

  return out;
};

export const scaled = (sound: Mono, gain: number): Mono => {
  for (let index = 0; index < sound.length; index += 1) {
    sound[index] = (sound[index] ?? 0) * gain;
  }

  return sound;
};

export const driven = (sound: Mono, drive: number): Mono => {
  const even = 1 / Math.tanh(drive);

  for (let index = 0; index < sound.length; index += 1) {
    sound[index] = Math.tanh((sound[index] ?? 0) * drive) * even;
  }

  return sound;
};

export const laid = (
  bus: Stereo,
  sound: Mono,
  place: { readonly at: number; readonly gain: number; readonly pan: number }
) => {
  const start = Math.round(place.at * SOUND_RATE);
  const angle = ((Math.min(1, Math.max(-1, place.pan)) + 1) * Math.PI) / 4;
  const left = Math.cos(angle) * place.gain * Math.SQRT2;
  const right = Math.sin(angle) * place.gain * Math.SQRT2;
  const from = Math.max(0, -start);
  const until = Math.min(sound.length, bus.left.length - start);

  for (let index = from; index < until; index += 1) {
    const sample = sound[index] ?? 0;

    bus.left[start + index] = (bus.left[start + index] ?? 0) + sample * left;
    bus.right[start + index] = (bus.right[start + index] ?? 0) + sample * right;
  }
};

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];

const ALLPASSES = [556, 441, 341, 225];

const SPREAD = 23;

const TUNED_AT = 44_100;

const roomChannel = (
  input: Float32Array,
  offset: number,
  room: { readonly damp: number; readonly size: number }
) => {
  const out = new Float32Array(input.length);

  for (const length of COMBS) {
    const line = new Float32Array(
      Math.round(((length + offset) * SOUND_RATE) / TUNED_AT)
    );

    let at = 0;
    let store = 0;

    for (let index = 0; index < input.length; index += 1) {
      const read = line[at] ?? 0;

      store = read * (1 - room.damp) + store * room.damp;
      line[at] = (input[index] ?? 0) + store * room.size;
      out[index] = (out[index] ?? 0) + read;
      at = (at + 1) % line.length;
    }
  }

  for (const length of ALLPASSES) {
    const line = new Float32Array(
      Math.round(((length + offset) * SOUND_RATE) / TUNED_AT)
    );

    let at = 0;

    for (let index = 0; index < out.length; index += 1) {
      const read = line[at] ?? 0;
      const sample = out[index] ?? 0;

      line[at] = sample + read * 0.5;
      out[index] = read - sample;
      at = (at + 1) % line.length;
    }
  }

  return out;
};

export const roomOf = (
  send: Stereo,
  room: { readonly damp: number; readonly size: number }
): Stereo => {
  const mono = new Float32Array(send.left.length);

  for (let index = 0; index < mono.length; index += 1) {
    mono[index] = ((send.left[index] ?? 0) + (send.right[index] ?? 0)) * 0.015;
  }

  return {
    left: roomChannel(mono, 0, room),
    right: roomChannel(mono, SPREAD, room),
  };
};

export const added = (into: Stereo, from: Stereo, gain: number) => {
  for (let index = 0; index < into.left.length; index += 1) {
    into.left[index] = (into.left[index] ?? 0) + (from.left[index] ?? 0) * gain;
    into.right[index] =
      (into.right[index] ?? 0) + (from.right[index] ?? 0) * gain;
  }
};

export const ridden = (bus: Stereo, level: Curve) => {
  for (let index = 0; index < bus.left.length; index += 1) {
    const gain = level(index / SOUND_RATE);

    bus.left[index] = (bus.left[index] ?? 0) * gain;
    bus.right[index] = (bus.right[index] ?? 0) * gain;
  }
};

const SHELF = {
  back: [-1.69065929318241, 0.73248077421585],
  forward: [1.53512485958697, -2.69169618940638, 1.19839281085285],
} as const;

const RUMBLE = {
  back: [-1.99004745483398, 0.99007225036621],
  forward: [1, -2, 1],
} as const;

const biquad = (
  input: Float32Array,
  taps: {
    readonly back: readonly [number, number];
    readonly forward: readonly [number, number, number];
  }
) => {
  const out = new Float32Array(input.length);
  let one = 0;
  let two = 0;

  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index] ?? 0;
    const result = taps.forward[0] * sample + one;

    one = taps.forward[1] * sample - taps.back[0] * result + two;
    two = taps.forward[2] * sample - taps.back[1] * result;
    out[index] = result;
  }

  return out;
};

const weighted = (input: Float32Array) => biquad(biquad(input, SHELF), RUMBLE);

const BLOCK = 0.4;

const HOP = 0.1;

const SILENT = -70;

const QUIETER_BY = -10;

const loudnessOf = (energy: number) => -0.691 + 10 * Math.log10(energy);

export const blockEnergies = (mix: Stereo): readonly number[] => {
  const left = weighted(mix.left);
  const right = weighted(mix.right);
  const block = samplesFor(BLOCK);
  const hop = samplesFor(HOP);
  const energies: number[] = [];

  for (let start = 0; start + block <= left.length; start += hop) {
    let total = 0;

    for (let index = start; index < start + block; index += 1) {
      total += (left[index] ?? 0) ** 2 + (right[index] ?? 0) ** 2;
    }

    energies.push(total / block);
  }

  return energies;
};

const meanOf = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0) /
  Math.max(1, values.length);

export const integratedLoudness = (mix: Stereo) => {
  const heard = blockEnergies(mix).filter(
    (energy) => energy > 0 && loudnessOf(energy) > SILENT
  );

  if (heard.length === 0) {
    return SILENT;
  }

  const gate = loudnessOf(meanOf(heard)) + QUIETER_BY;

  return loudnessOf(
    meanOf(heard.filter((energy) => loudnessOf(energy) > gate))
  );
};

export const peakOf = (mix: Stereo) => {
  let peak = 0;

  for (let index = 0; index < mix.left.length; index += 1) {
    peak = Math.max(
      peak,
      Math.abs(mix.left[index] ?? 0),
      Math.abs(mix.right[index] ?? 0)
    );
  }

  return peak;
};

const ATTACK = 0.003;

const RELEASE = 0.12;

export const limited = (mix: Stereo, ceiling: number) => {
  const size = mix.left.length;
  const gains = new Float32Array(size);
  const gather = Math.exp(-1 / (ATTACK * SOUND_RATE));
  const recover = Math.exp(-1 / (RELEASE * SOUND_RATE));
  let gain = 1;

  for (let index = size - 1; index >= 0; index -= 1) {
    const peak = Math.max(
      Math.abs(mix.left[index] ?? 0),
      Math.abs(mix.right[index] ?? 0)
    );

    gain = Math.min(
      peak > ceiling ? ceiling / peak : 1,
      1 - (1 - gain) * gather
    );
    gains[index] = gain;
  }

  gain = 1;

  for (let index = 0; index < size; index += 1) {
    gain = Math.min(gains[index] ?? 1, 1 - (1 - gain) * recover);
    mix.left[index] = (mix.left[index] ?? 0) * gain;
    mix.right[index] = (mix.right[index] ?? 0) * gain;
  }
};

export const leaned = (mix: Stereo, below: number, amount: number) => {
  if (amount <= 0) {
    return;
  }

  for (const channel of [mix.left, mix.right]) {
    const lows = filtered(Float32Array.from(channel), "Low", steady(below));

    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = (channel[index] ?? 0) - (lows[index] ?? 0) * amount;
    }
  }
};

const MASTER_PASSES = 3;

export const mastered = (
  mix: Stereo,
  target: { readonly ceiling: number; readonly loudness: number }
) => {
  for (let pass = 0; pass < MASTER_PASSES; pass += 1) {
    ridden(mix, steady(gainOf(target.loudness - integratedLoudness(mix))));
    limited(mix, gainOf(target.ceiling));
  }

  return mix;
};
