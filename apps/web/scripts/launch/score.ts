import { clap, crash } from "../../src/features/moments/sound/drift-voices.js";
import {
  SOUND_RATE,
  added,
  chanceFrom,
  contoured,
  driven,
  filtered,
  gainOf,
  held,
  hertz,
  hiss,
  laid,
  mastered,
  ridden,
  roomOf,
  scaled,
  steady,
  stereoOf,
  struck,
  summed,
  tone,
  truePeakOf,
} from "../../src/features/moments/sound/dsp.js";
import type {
  Chance,
  Curve,
  Mono,
  Stereo,
} from "../../src/features/moments/sound/dsp.js";
import { bell, thump, tick } from "../../src/features/moments/sound/kit.js";
import {
  BEAT_MS,
  CHIMES,
  DROP_BEAT,
  HIT_BEAT,
  LENGTH_MS,
  RULE_STAMPS,
} from "./timeline.ts";

export const SCORE_LOUDNESS = -14;

export const SCORE_TRUE_PEAK = -3;

const BEAT = BEAT_MS / 1000;

const SWING = 0.58;

const swung = (beat: number) => {
  const whole = Math.floor(beat);
  const part = beat - whole;

  const moved =
    part < 0.5
      ? (part / 0.5) * SWING
      : SWING + ((part - 0.5) / 0.5) * (1 - SWING);

  return (whole + moved) * BEAT;
};

interface Mix {
  readonly dry: Stereo;
  readonly send: Stereo;
  readonly chance: Chance;
}

const put = (
  mix: Mix,
  sound: Mono,
  place: {
    readonly beat: number;
    readonly gain: number;
    readonly pan?: number;
    readonly wet?: number;
    readonly straight?: boolean;
  }
) => {
  const at = place.straight === true ? place.beat * BEAT : swung(place.beat);
  const pan = place.pan ?? 0;

  laid(mix.dry, sound, { at, gain: place.gain, pan });

  if ((place.wet ?? 0) > 0) {
    laid(mix.send, sound, { at, gain: place.gain * (place.wet ?? 0), pan });
  }
};

const vibrato =
  (pitch: number, from: number, depth: number): Curve =>
  (time) =>
    pitch *
    2 **
      ((Math.sin(2 * Math.PI * 5.4 * time) *
        depth *
        Math.min(1, Math.max(0, (time - from) / 0.15))) /
        1200);

const pluckBass = (midi: number, beats: number): Mono => {
  const seconds = Math.max(0.12, beats * BEAT);
  const pitch = hertz(midi);

  const body = filtered(
    tone("Saw", steady(pitch), seconds),
    "Low",
    (time) => 220 + 1500 * Math.exp(-time / 0.07),
    1.3
  );

  return driven(
    summed([
      contoured(
        body,
        (time) =>
          struck(0.003, seconds * 0.9)(time) *
          held(0, seconds - 0.04, 0.04)(time)
      ),
      scaled(
        contoured(
          tone("Sine", steady(pitch), seconds),
          (time) =>
            struck(0.004, seconds)(time) * held(0, seconds - 0.04, 0.04)(time)
        ),
        0.8
      ),
    ]),
    1.4
  );
};

const keys = (midi: number, seconds: number): Mono => {
  const pitch = hertz(midi);

  return contoured(
    summed([
      tone("Sine", steady(pitch), seconds),
      scaled(
        contoured(
          tone("Sine", steady(pitch * 2), seconds),
          struck(0.002, 0.35)
        ),
        0.3
      ),
      scaled(
        contoured(
          tone("Sine", steady(pitch * 3), seconds),
          struck(0.002, 0.12)
        ),
        0.12
      ),
    ]),
    (time) =>
      struck(0.006, seconds * 0.9)(time) *
      held(0, seconds - 0.08, 0.08)(time) *
      (1 + 0.12 * Math.sin(2 * Math.PI * 4.6 * time))
  );
};

const kalimba = (midi: number, chance: Chance): Mono => {
  const pitch = hertz(midi);

  return summed([
    contoured(tone("Sine", steady(pitch), 1.1), struck(0.002, 0.9)),
    scaled(
      contoured(tone("Sine", steady(pitch * 5.95), 0.2), struck(0.001, 0.09)),
      0.35
    ),
    scaled(
      contoured(tone("Sine", steady(pitch * 3.01), 0.4), struck(0.001, 0.22)),
      0.18
    ),
    scaled(tick(chance, 3200, 0.01, 1.5), 0.25),
  ]);
};

const whistle = (midi: number, beats: number, chance: Chance): Mono => {
  const seconds = Math.max(0.15, beats * BEAT);
  const pitch = hertz(midi);

  return summed([
    contoured(
      tone("Sine", vibrato(pitch, 0.12, 14), seconds),
      held(0.035, seconds - 0.11, 0.09)
    ),
    scaled(
      contoured(
        filtered(hiss(seconds, chance), "Band", steady(pitch * 2), 6),
        held(0.03, seconds - 0.1, 0.08)
      ),
      0.08
    ),
  ]);
};

const softKick = (): Mono =>
  summed([thump(130, 48, 0.32), scaled(thump(400, 140, 0.03), 0.25)]);

const brush = (chance: Chance, seconds: number): Mono =>
  contoured(
    filtered(hiss(seconds, chance), "Band", steady(7200), 0.7),
    held(0.008, 0, seconds)
  );

const snap = (chance: Chance): Mono =>
  summed([
    scaled(tick(chance, 2100, 0.06, 3), 1.2),
    scaled(
      contoured(tone("Sine", steady(1650), 0.03), struck(0.001, 0.025)),
      0.25
    ),
  ]);

const softClap = (chance: Chance): Mono =>
  filtered(clap(chance), "Low", steady(4200));

const woodblock = (midi: number): Mono =>
  summed([
    contoured(tone("Sine", steady(hertz(midi)), 0.15), struck(0.001, 0.08)),
    scaled(
      contoured(
        tone("Triangle", steady(hertz(midi) * 2.7), 0.06),
        struck(0.001, 0.03)
      ),
      0.3
    ),
  ]);

interface Chord {
  readonly root: number;
  readonly voicing: readonly number[];
  readonly beats: number;
}

const FMAJ9: Chord = { beats: 4, root: 41, voicing: [57, 60, 64, 67] };

const EM7: Chord = { beats: 2, root: 40, voicing: [55, 59, 62, 64] };

const A7: Chord = { beats: 2, root: 45, voicing: [55, 61, 64, 66] };

const DM9: Chord = { beats: 4, root: 38, voicing: [53, 57, 60, 64] };

const G9: Chord = { beats: 2, root: 43, voicing: [53, 57, 59, 64] };

const DB9: Chord = { beats: 2, root: 37, voicing: [53, 59, 63, 65] };

const GSUS: Chord = { beats: 2, root: 43, voicing: [53, 57, 60, 62] };

const LOOP: readonly (readonly Chord[])[] = [
  [FMAJ9],
  [EM7, A7],
  [DM9],
  [G9, DB9],
];

const barAt = (beat: number): readonly Chord[] => {
  const bar = Math.floor(beat / 4);

  if (beat >= HIT_BEAT) {
    return [{ ...FMAJ9, beats: 4 }];
  }

  if (beat >= 76) {
    return beat < 78 ? [DM9] : [G9, GSUS];
  }

  if (beat >= DROP_BEAT) {
    return LOOP[Math.floor((beat - DROP_BEAT) / 4) % 4] ?? [FMAJ9];
  }

  if (bar === 12) {
    return [G9, DB9];
  }

  return LOOP[bar % 4] ?? [FMAJ9];
};

const chordsOf = (from: number, to: number) => {
  const found: { readonly beat: number; readonly chord: Chord }[] = [];

  for (let bar = Math.floor(from / 4); bar * 4 < to; bar += 1) {
    let beat = bar * 4;

    for (const chord of barAt(bar * 4)) {
      if (beat >= from && beat < to) {
        found.push({ beat, chord });
      }

      beat += chord.beats;
    }
  }

  return found;
};

const BASS_FULL: readonly (readonly [number, number, number])[] = [
  [0, 0, 0.45],
  [0.75, 0, 0.2],
  [1.5, 12, 0.3],
  [2, 7, 0.45],
  [3, 10, 0.3],
  [3.5, 12, 0.25],
];

const BASS_HALF: readonly (readonly [number, number, number])[] = [
  [0, 0, 0.45],
  [0.75, 12, 0.2],
  [1.5, 7, 0.3],
];

const bassLine = (mix: Mix, from: number, to: number, busy: boolean) => {
  for (const { beat, chord } of chordsOf(from, to)) {
    const pattern = chord.beats === 4 ? BASS_FULL : BASS_HALF;

    for (const [at, step, length] of pattern) {
      put(mix, pluckBass(chord.root + step, length), {
        beat: beat + at,
        gain: 0.34,
      });
    }

    if (busy) {
      put(mix, pluckBass(chord.root + 12, 0.15), {
        beat: beat + chord.beats - 0.25,
        gain: 0.22,
      });
    }
  }
};

const keyStabs = (mix: Mix, from: number, to: number, level: number) => {
  for (const { beat, chord } of chordsOf(from, to)) {
    const hits =
      chord.beats === 4
        ? [
            [0, 1.4],
            [1.5, 0.4],
            [2.5, 1.2],
          ]
        : [
            [0, 1],
            [1.5, 0.4],
          ];

    for (const [at = 0, length = 1] of hits) {
      for (const [index, midi] of chord.voicing.entries()) {
        put(mix, keys(midi, length * BEAT + 0.2), {
          beat: beat + at,
          gain: level * (at === 0 ? 0.1 : 0.07),
          pan: (index - 1.5) * 0.25,
          wet: 0.35,
        });
      }
    }
  }
};

const pad = (mix: Mix, from: number, to: number, level: number) => {
  for (const { beat, chord } of chordsOf(from, to)) {
    for (const [index, midi] of chord.voicing.entries()) {
      put(mix, keys(midi, chord.beats * BEAT + 0.3), {
        beat,
        gain: level * 0.085,
        pan: (index - 1.5) * 0.3,
        straight: true,
        wet: 0.5,
      });
    }
  }
};

const drums = (mix: Mix, from: number, to: number, busy: boolean) => {
  for (let beat = Math.ceil(from); beat < to; beat += 1) {
    const inBar = beat % 4;

    if (inBar === 0 || inBar === 2 || (busy && inBar === 3)) {
      put(mix, softKick(), { beat, gain: inBar === 3 ? 0.45 : 0.75 });
    }

    if (inBar === 2 && busy) {
      put(mix, softKick(), { beat: beat + 0.75, gain: 0.35 });
    }

    if (inBar === 1 || inBar === 3) {
      put(mix, softClap(mix.chance), {
        beat,
        gain: busy ? 0.42 : 0.32,
        wet: 0.45,
      });
      put(mix, snap(mix.chance), { beat, gain: 0.25, pan: 0.2 });
    }

    for (const part of busy ? [0, 0.25, 0.5, 0.75] : [0, 0.5]) {
      put(mix, brush(mix.chance, part === 0.5 ? 0.12 : 0.06), {
        beat: beat + part,
        gain: part === 0 ? 0.16 : 0.11,
        pan: 0.35,
      });
    }

    if (busy) {
      put(mix, brush(mix.chance, 0.22), {
        beat: beat + 0.5,
        gain: 0.07,
        pan: -0.4,
        wet: 0.2,
      });
    }
  }
};

const MOTIF: readonly (readonly [number, number])[] = [
  [0, 72],
  [0.5, 69],
  [1, 65],
  [1.5, 67],
  [2, 69],
  [3, 72],
  [3.5, 74],
  [4.5, 72],
  [5, 69],
  [6, 67],
  [6.5, 65],
];

const kalimbaPhrase = (
  mix: Mix,
  from: number,
  notes: readonly (readonly [number, number])[],
  gain: number
) => {
  for (const [index, [at, midi]] of notes.entries()) {
    put(mix, kalimba(midi, mix.chance), {
      beat: from + at,
      gain,
      pan: index % 2 === 0 ? -0.35 : 0.35,
      wet: 0.4,
    });
  }
};

const arpeggio = (mix: Mix, from: number, to: number, gain: number) => {
  for (const { beat, chord } of chordsOf(from, to)) {
    const tones = chord.voicing.map((midi) => midi + 12);

    for (let step = 0; step < chord.beats * 2; step += 1) {
      const up = step % 6;
      const midi = tones[up < 4 ? up : 6 - up] ?? tones[0] ?? 72;

      put(mix, kalimba(midi, mix.chance), {
        beat: beat + step / 2,
        gain: gain * (step % 2 === 0 ? 1 : 0.7),
        pan: step % 2 === 0 ? -0.4 : 0.4,
        wet: 0.4,
      });
    }
  }
};

const TUNE: readonly (readonly [number, number, number])[] = [
  [0, 72, 0.5],
  [1, 69, 0.4],
  [1.5, 72, 0.4],
  [2, 74, 0.5],
  [2.5, 72, 0.9],
  [3.5, 69, 0.4],
  [4, 67, 0.5],
  [4.5, 69, 0.4],
  [5, 72, 0.9],
  [6, 73, 0.5],
  [6.5, 76, 1.2],
  [8, 77, 0.9],
  [9, 76, 0.4],
  [9.5, 74, 0.4],
  [10, 72, 0.9],
  [11, 69, 0.4],
  [11.5, 72, 0.5],
  [12, 74, 1.4],
  [13.5, 71, 0.4],
  [14, 72, 0.4],
  [14.5, 74, 0.4],
  [15, 77, 0.9],
  [16, 72, 0.5],
  [17, 69, 0.4],
  [17.5, 72, 0.4],
  [18, 74, 0.5],
  [18.5, 72, 0.9],
  [19.5, 69, 0.4],
  [20, 79, 0.5],
  [20.5, 77, 0.4],
  [21, 76, 0.4],
  [21.5, 74, 0.4],
  [22, 72, 1.6],
];

const lead = (mix: Mix, from: number) => {
  for (const [at, midi, beats] of TUNE) {
    put(mix, whistle(midi + 12, beats, mix.chance), {
      beat: from + at,
      gain: 0.085,
      pan: 0.1,
      wet: 0.45,
    });
  }
};

const PICKUP: readonly (readonly [number, number])[] = [
  [0, 72],
  [0.25, 74],
  [0.5, 77],
  [0.75, 79],
];

const chimes = (mix: Mix) => {
  const pitches = [84, 81, 88, 86];

  for (const [index, beat] of CHIMES.entries()) {
    put(mix, bell(hertz(pitches[index % pitches.length] ?? 84), 1.4), {
      beat,
      gain: 0.07,
      pan: index % 2 === 0 ? -0.3 : 0.3,
      straight: true,
      wet: 0.5,
    });
  }

  for (const [index, stamp] of RULE_STAMPS.entries()) {
    put(mix, woodblock(72 + index * 2), {
      beat: stamp.beat,
      gain: 0.3,
      pan: index % 2 === 0 ? -0.2 : 0.2,
      straight: true,
    });
    put(mix, thump(160, 60, 0.12), {
      beat: stamp.beat,
      gain: 0.35,
      straight: true,
    });
  }
};

const hit = (mix: Mix) => {
  put(mix, softKick(), { beat: HIT_BEAT, gain: 0.9, straight: true });
  put(
    mix,
    contoured(tone("Sine", steady(hertz(29)), 2.2), struck(0.004, 1.6)),
    {
      beat: HIT_BEAT,
      gain: 0.22,
      straight: true,
    }
  );
  put(mix, filtered(crash(mix.chance, 2.6), "Low", steady(9000)), {
    beat: HIT_BEAT,
    gain: 0.22,
    straight: true,
    wet: 0.5,
  });

  for (const [index, midi] of [53, 57, 60, 64, 67, 72].entries()) {
    put(mix, keys(midi, 3.8), {
      beat: HIT_BEAT,
      gain: 0.09,
      pan: (index - 2.5) * 0.25,
      straight: true,
      wet: 0.6,
    });
  }

  put(mix, bell(hertz(89), 3), {
    beat: HIT_BEAT,
    gain: 0.12,
    straight: true,
    wet: 0.6,
  });

  const sparkle = [84, 81, 77, 72, 69, 65];

  for (const [index, midi] of sparkle.entries()) {
    put(mix, kalimba(midi, mix.chance), {
      beat: HIT_BEAT + 1 + index * 0.5,
      gain: 0.2 - index * 0.02,
      pan: index % 2 === 0 ? -0.4 : 0.4,
      wet: 0.5,
    });
  }

  drums(mix, HIT_BEAT + 2, HIT_BEAT + 6, false);
  bassLine(mix, HIT_BEAT + 2, HIT_BEAT + 4, false);
};

const riseInto = (mix: Mix, beat: number) => {
  put(
    mix,
    contoured(
      filtered(
        hiss(BEAT * 2, mix.chance),
        "Band",
        (time) => 800 + 5000 * (time / (BEAT * 2)),
        1.2
      ),
      (time) => (time / (BEAT * 2)) ** 2
    ),
    { beat: beat - 2, gain: 0.12, straight: true, wet: 0.3 }
  );
};

export const launchScore = (): Stereo => {
  const seconds = LENGTH_MS / 1000;

  const mix: Mix = {
    chance: chanceFrom(116),
    dry: stereoOf(seconds),
    send: stereoOf(seconds),
  };

  kalimbaPhrase(mix, 0, MOTIF, 0.26);
  pad(mix, 0, 8, 0.55);

  for (const beat of [1, 3, 5, 7]) {
    put(mix, snap(mix.chance), { beat, gain: 0.3, pan: 0.2 });
  }

  bassLine(mix, 4, 50, false);
  drums(mix, 4, 51, false);
  keyStabs(mix, 8, 51, 1);

  for (const from of [16, 32, 40]) {
    kalimbaPhrase(mix, from, MOTIF, 0.16);
  }

  arpeggio(mix, 24, 32, 0.1);
  kalimbaPhrase(mix, 51, PICKUP, 0.24);
  riseInto(mix, DROP_BEAT);

  bassLine(mix, DROP_BEAT, 76, true);
  drums(mix, DROP_BEAT, 76, true);
  keyStabs(mix, DROP_BEAT, 76, 1.1);
  lead(mix, DROP_BEAT);
  arpeggio(mix, 68, 76, 0.08);

  pad(mix, 76, 80, 1);
  arpeggio(mix, 76, 79.5, 0.13);
  drums(mix, 76, 79, false);
  riseInto(mix, HIT_BEAT);
  chimes(mix);
  hit(mix);

  const out = stereoOf(seconds);

  added(out, mix.dry, 1);
  added(out, roomOf(mix.send, { damp: 0.45, size: 0.75 }), 0.9);
  ridden(out, (time) => Math.min(1, Math.max(0, (seconds - time) / 1.2)));

  let ceiling = -3.5;

  for (let pass = 0; pass < 5; pass += 1) {
    mastered(out, { ceiling, loudness: SCORE_LOUDNESS });

    const over = 20 * Math.log10(truePeakOf(out)) - SCORE_TRUE_PEAK;

    if (over <= 0) {
      break;
    }

    ceiling -= over + 0.2;
  }

  const left = SCORE_TRUE_PEAK - 20 * Math.log10(truePeakOf(out));

  if (left < 0) {
    ridden(out, steady(gainOf(left)));
  }

  return out;
};

const sample = (value: number) =>
  Math.round(Math.max(-1, Math.min(1, value)) * 32_767);

export const wavOf = (mix: Stereo): Uint8Array => {
  const frames = mix.left.length;
  const bytes = new Uint8Array(44 + frames * 4);
  const view = new DataView(bytes.buffer);

  const text = (at: number, word: string) => {
    for (let index = 0; index < word.length; index += 1) {
      view.setUint8(at + index, word.codePointAt(index) ?? 0);
    }
  };

  text(0, "RIFF");
  view.setUint32(4, 36 + frames * 4, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, SOUND_RATE, true);
  view.setUint32(28, SOUND_RATE * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * 4, true);

  for (let index = 0; index < frames; index += 1) {
    view.setInt16(44 + index * 4, sample(mix.left[index] ?? 0), true);
    view.setInt16(46 + index * 4, sample(mix.right[index] ?? 0), true);
  }

  return bytes;
};
