import { Effect } from "effect";

import type { SoundStep } from "../../features/moments/score.js";

const FLOOR = 0.0001;

const NOISE_SECONDS = 0.5;

export interface Synth {
  readonly ctx: BaseAudioContext;
  readonly noise: AudioBuffer;
  readonly out: AudioNode;
}

export const noiseFor = (ctx: BaseAudioContext, random: () => number) => {
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    data[index] = random() * 2 - 1;
  }

  return noise;
};

const playStep = (
  synth: Synth,
  start: number,
  step: SoundStep,
  offset: number
) => {
  const { ctx } = synth;
  const at = start + step.at;
  const gain = ctx.createGain();

  gain.gain.setValueAtTime(FLOOR, at);
  gain.gain.exponentialRampToValueAtTime(
    step.gain,
    at + (step.kind === "Tone" ? 0.005 : 0.002)
  );
  gain.gain.exponentialRampToValueAtTime(FLOOR, at + step.dur);
  gain.connect(synth.out);

  if (step.kind === "Tone") {
    const oscillator = ctx.createOscillator();

    oscillator.type = step.wave;
    oscillator.frequency.setValueAtTime(step.from, at);
    oscillator.frequency.exponentialRampToValueAtTime(step.to, at + step.dur);
    oscillator.connect(gain);
    oscillator.start(at);
    oscillator.stop(at + step.dur + 0.02);

    return;
  }

  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();

  source.buffer = synth.noise;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(step.freq, at);

  if (step.sweepTo !== step.freq) {
    filter.frequency.exponentialRampToValueAtTime(step.sweepTo, at + step.dur);
  }

  filter.Q.value = step.q;
  source.connect(filter).connect(gain);
  source.start(at, offset);
  source.stop(at + step.dur + 0.02);
};

export const perform = (
  synth: Synth,
  steps: readonly SoundStep[],
  start: number,
  random: () => number
) => {
  for (const step of steps) {
    playStep(synth, start, step, random() * 0.3);
  }
};

export const seededNoise = (seed: number) => {
  let state = seed;

  return () => {
    state = (state * 16_807) % 2_147_483_647;

    return state / 2_147_483_647;
  };
};

const OFFLINE_SEED = 7;

const STEPS_PER_SLICE = 24;

export const renderScore = (
  steps: readonly SoundStep[],
  output: {
    readonly channels: number;
    readonly sampleRate: number;
    readonly seconds: number;
  },
  pause: Effect.Effect<void> = Effect.void
) =>
  Effect.gen(function* render() {
    const ctx = new OfflineAudioContext(
      output.channels,
      Math.ceil(output.seconds * output.sampleRate),
      output.sampleRate
    );

    const out = ctx.createGain();
    const random = seededNoise(OFFLINE_SEED);
    const synth = { ctx, noise: noiseFor(ctx, random), out };

    out.gain.value = 0.9;
    out.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);

    for (let from = 0; from < steps.length; from += STEPS_PER_SLICE) {
      yield* pause;
      perform(synth, steps.slice(from, from + STEPS_PER_SLICE), 0, random);
    }

    return yield* Effect.tryPromise(() => ctx.startRendering());
  });
