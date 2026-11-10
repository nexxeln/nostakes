const MODULUS = 2_147_483_647;

const MULTIPLIER = 16_807;

const NOISE_SECONDS = 0.5;

const FLOOR = 0.0001;

interface Burst {
  readonly at: number;
  readonly freq: number;
  readonly q: number;
  readonly dur: number;
  readonly gain: number;
  readonly sweepTo?: number;
}

interface Tone {
  readonly at: number;
  readonly from: number;
  readonly to: number;
  readonly dur: number;
  readonly gain: number;
  readonly wave?: OscillatorType;
}

interface Voice {
  readonly ctx: AudioContext;
  readonly noise: AudioBuffer;
  readonly out: GainNode;
}

const CHORD = [
  [392, 0],
  [494, 0.07],
  [587, 0.14],
  [784, 0.24],
] as const;

const playTone = (voice: Voice, tone: Tone) => {
  const { ctx } = voice;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = tone.wave ?? "sine";
  oscillator.frequency.setValueAtTime(tone.from, tone.at);
  oscillator.frequency.exponentialRampToValueAtTime(
    tone.to,
    tone.at + tone.dur
  );
  gain.gain.setValueAtTime(FLOOR, tone.at);
  gain.gain.exponentialRampToValueAtTime(tone.gain, tone.at + 0.005);
  gain.gain.exponentialRampToValueAtTime(FLOOR, tone.at + tone.dur);
  oscillator.connect(gain).connect(voice.out);
  oscillator.start(tone.at);
  oscillator.stop(tone.at + tone.dur + 0.02);
};

export class TableSound {
  #voice: Voice | null = null;
  #seed = 7;
  #on = true;

  get on(): boolean {
    return this.#on;
  }

  set on(next: boolean) {
    this.#on = next;
  }

  #next(): number {
    this.#seed = (this.#seed * MULTIPLIER) % MODULUS;

    return this.#seed / MODULUS;
  }

  unlock() {
    if (!this.#on) {
      return;
    }

    this.#voice ??= this.#build();

    if (this.#voice !== null && this.#voice.ctx.state !== "running") {
      void this.#voice.ctx.resume();
    }
  }

  #build(): Voice | null {
    if (!("AudioContext" in globalThis)) {
      return null;
    }

    const ctx = new AudioContext();
    const out = ctx.createGain();

    out.gain.value = 0.9;
    out.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);

    const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);

    for (let index = 0; index < length; index += 1) {
      data[index] = this.#next() * 2 - 1;
    }

    return { ctx, noise, out };
  }

  #ready(): Voice | null {
    if (!this.#on || this.#voice === null) {
      return null;
    }

    return this.#voice.ctx.state === "running" ? this.#voice : null;
  }

  #burst(voice: Voice, burst: Burst) {
    const { ctx } = voice;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    source.buffer = voice.noise;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(burst.freq, burst.at);

    if (burst.sweepTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        burst.sweepTo,
        burst.at + burst.dur
      );
    }

    filter.Q.value = burst.q;
    gain.gain.setValueAtTime(FLOOR, burst.at);
    gain.gain.exponentialRampToValueAtTime(burst.gain, burst.at + 0.002);
    gain.gain.exponentialRampToValueAtTime(FLOOR, burst.at + burst.dur);
    source.connect(filter).connect(gain).connect(voice.out);
    source.start(burst.at, this.#next() * 0.3);
    source.stop(burst.at + burst.dur + 0.02);
  }

  chips(count = 3, delay = 0, soft = 1) {
    const voice = this.#ready();

    if (voice === null) {
      return;
    }

    let at = voice.ctx.currentTime + delay;

    for (let index = 0; index < count; index += 1) {
      const freq = 2600 + this.#next() * 2600;

      this.#burst(voice, { at, dur: 0.045, freq, gain: 0.35 * soft, q: 7 });
      playTone(voice, {
        at,
        dur: 0.05,
        from: freq * 0.8,
        gain: 0.035 * soft,
        to: freq * 0.76,
      });
      at += 0.022 + this.#next() * 0.045;
    }
  }

  card(delay = 0) {
    const voice = this.#ready();

    if (voice !== null) {
      this.#burst(voice, {
        at: voice.ctx.currentTime + delay,
        dur: 0.11,
        freq: 900,
        gain: 0.22,
        q: 1.2,
        sweepTo: 4200,
      });
    }
  }

  flip(delay = 0) {
    const voice = this.#ready();

    if (voice !== null) {
      const at = voice.ctx.currentTime + delay;

      this.#burst(voice, { at, dur: 0.02, freq: 3200, gain: 0.3, q: 4 });
      this.#burst(voice, {
        at: at + 0.015,
        dur: 0.07,
        freq: 1400,
        gain: 0.12,
        q: 1.5,
        sweepTo: 3000,
      });
    }
  }

  knock() {
    const voice = this.#ready();

    if (voice === null) {
      return;
    }

    for (const offset of [0, 0.13]) {
      const at = voice.ctx.currentTime + offset;

      playTone(voice, { at, dur: 0.09, from: 170, gain: 0.5, to: 70 });
      this.#burst(voice, { at, dur: 0.03, freq: 600, gain: 0.18, q: 1 });
    }
  }

  tick(strong = false) {
    const voice = this.#ready();

    if (voice !== null) {
      this.#burst(voice, {
        at: voice.ctx.currentTime,
        dur: 0.025,
        freq: strong ? 2100 : 1700,
        gain: strong ? 0.5 : 0.25,
        q: 12,
      });
    }
  }

  heartbeat() {
    const voice = this.#ready();

    if (voice !== null) {
      const at = voice.ctx.currentTime;

      playTone(voice, { at, dur: 0.16, from: 70, gain: 0.5, to: 45 });
      playTone(voice, {
        at: at + 0.2,
        dur: 0.14,
        from: 64,
        gain: 0.32,
        to: 42,
      });
    }
  }

  turn() {
    const voice = this.#ready();

    if (voice !== null) {
      const at = voice.ctx.currentTime;

      playTone(voice, {
        at,
        dur: 0.35,
        from: 659,
        gain: 0.09,
        to: 659,
        wave: "triangle",
      });
      playTone(voice, {
        at: at + 0.11,
        dur: 0.5,
        from: 988,
        gain: 0.07,
        to: 988,
        wave: "triangle",
      });
    }
  }

  win() {
    const voice = this.#ready();

    if (voice === null) {
      return;
    }

    this.chips(16, 0.05, 0.8);

    const at = voice.ctx.currentTime + 0.2;

    for (const [freq, offset] of CHORD) {
      playTone(voice, {
        at: at + offset,
        dur: 1.1,
        from: freq,
        gain: 0.05,
        to: freq,
        wave: "triangle",
      });
    }
  }

  buzz(pattern: readonly number[]) {
    if (this.#on && "vibrate" in globalThis.navigator) {
      globalThis.navigator.vibrate([...pattern]);
    }
  }
}
