import {
  BEATS_IN_BAR,
  BEAT_SECONDS,
  BUILD_BEAT,
  CLAP_STEPS,
  KICK_STEPS,
  ROLL_BEAT,
  STEPS_IN_BAR,
  STEPS_IN_BEAT,
  STEP_SECONDS,
} from "../drift/groove.js";
import {
  boom,
  clap,
  counter,
  cowbell,
  crash,
  ducked,
  hat,
  repeated,
  saturated,
  shortKick,
  silenced,
  slap808,
  snare,
  suckIn,
  tapeStopped,
} from "./drift-voices.js";
import {
  SOUND_RATE,
  added,
  contoured,
  filtered,
  gainOf,
  glide,
  held,
  hertz,
  integratedLoudness,
  laid,
  ridden,
  roomOf,
  scaled,
  steady,
  stereoOf,
  struck,
  tone,
} from "./dsp.js";
import type { Chance, Mono, Stereo } from "./dsp.js";
import { cardSnap, riser, swish, thump } from "./kit.js";
import type { SmallLook } from "./kit.js";
import type {
  ScoreKit,
  ScoreTimes,
  Scoring,
  SmallCue,
  SmallSound,
} from "./sheet.js";

export const DRIFT_LOUDNESS = -10;

export const DRIFT_CEILING = -2;

export const DRIFT_TRUE_PEAK = -2.4;

type Part = "Drums" | "Music";

interface Place {
  readonly at: number;
  readonly gain: number;
  readonly pan?: number;
  readonly wet?: number;
}

interface Stem {
  readonly chance: Chance;
  readonly kicks: number[];
  readonly parts: Readonly<Record<Part, Stereo>>;
  readonly send: Stereo;
}

const TRIMS: Readonly<Record<Part, number>> = { Drums: 0.5, Music: 2 };

const ROOM = { damp: 0.3, size: 0.8 };

const WET = 0.8;

const PUMP = { depth: 0.55, release: 0.09 };

const stemOf = (seconds: number, chance: Chance): Stem => ({
  chance,
  kicks: [],
  parts: { Drums: stereoOf(seconds), Music: stereoOf(seconds) },
  send: stereoOf(seconds),
});

const put = (stem: Stem, part: Part, sound: Mono, place: Place) => {
  const pan = place.pan ?? 0;
  const wet = place.wet ?? 0;
  const gain = place.gain * TRIMS[part];

  laid(stem.parts[part], sound, { at: place.at, gain, pan });

  if (wet > 0) {
    laid(stem.send, sound, { at: place.at, gain: gain * wet, pan });
  }
};

const kicked = (stem: Stem, sound: Mono, place: Place) => {
  stem.kicks.push(place.at);
  put(stem, "Drums", sound, place);
};

const STEPS = Array.from({ length: STEPS_IN_BAR }, (_, step) => step);

const EIGHTHS = STEPS.filter((step) => step % 2 === 0);

const OFF_BEATS = [2, 6, 10, 14];

const TUNES = [
  [74, 0, 74, 77, 0, 74, 75, 74],
  [72, 0, 72, 74, 0, 70, 69, 0],
];

const ROOTS = [38, 38, 41, 36];

const sideOf = (index: number) => (index % 2 === 0 ? -0.25 : 0.25);

const tuned = (
  stem: Stem,
  bar: number,
  from: number,
  look: { readonly drive: number; readonly gain: number; readonly low: boolean }
) => {
  const tune = TUNES[bar % TUNES.length] ?? [];

  for (const [index, midi] of tune.entries()) {
    if (midi > 0) {
      const place = {
        at: from + index * 2 * STEP_SECONDS,
        pan: sideOf(index),
        wet: 0.35,
      };

      put(stem, "Music", cowbell(midi, 0.22, look.drive), {
        ...place,
        gain: look.gain,
      });

      if (look.low) {
        put(stem, "Music", cowbell(midi - 12, 0.2, look.drive + 1), {
          ...place,
          gain: look.gain * 0.6,
        });
      }
    }
  }
};

const drone = (midi: number, seconds: number): Mono =>
  contoured(
    tone("Sine", steady(hertz(midi)), seconds),
    held(0.3, Math.max(0, seconds - 0.6), 0.3)
  );

const opened = (stem: Stem) => {
  tuned(stem, 0, 0, { drive: 1.2, gain: 0.32, low: false });
  put(stem, "Drums", drone(26, BEAT_SECONDS * BUILD_BEAT), {
    at: 0,
    gain: 0.3,
  });
};

const built = (stem: Stem, bar: number, from: number) => {
  const root = ROOTS[bar % ROOTS.length] ?? 38;

  tuned(stem, bar, from, { drive: 1.8, gain: 0.4 + 0.08 * bar, low: false });

  for (const step of KICK_STEPS) {
    const at = from + step * STEP_SECONDS;

    kicked(stem, shortKick(stem.chance, 170), { at, gain: 0.8 });
    put(stem, "Drums", slap808(root, STEP_SECONDS * 3.2, 4), {
      at,
      gain: 0.5,
    });
  }

  for (const step of CLAP_STEPS) {
    put(stem, "Music", clap(stem.chance), {
      at: from + step * STEP_SECONDS,
      gain: 0.5,
      wet: 0.4,
    });
  }

  for (const step of EIGHTHS) {
    put(stem, "Music", hat(stem.chance, 0.04), {
      at: from + step * STEP_SECONDS,
      gain: 0.12 + 0.06 * bar,
      pan: 0.3,
    });
  }
};

const dropped = (stem: Stem, bar: number, from: number) => {
  const root = ROOTS[bar % ROOTS.length] ?? 38;

  tuned(stem, bar, from, { drive: 3, gain: 0.5, low: true });

  for (const step of KICK_STEPS) {
    const at = from + step * STEP_SECONDS;

    kicked(stem, shortKick(stem.chance, 190), { at, gain: 1 });
    put(stem, "Drums", slap808(root, STEP_SECONDS * 3.6, 8), {
      at,
      gain: 0.8,
    });
  }

  for (const step of CLAP_STEPS) {
    const at = from + step * STEP_SECONDS;

    put(stem, "Music", clap(stem.chance), { at, gain: 0.6, wet: 0.4 });
    put(stem, "Music", snare(stem.chance), { at, gain: 0.4, wet: 0.2 });
  }

  for (const step of STEPS) {
    put(stem, "Music", hat(stem.chance, 0.035), {
      at: from + step * STEP_SECONDS,
      gain: step % 2 === 0 ? 0.13 : 0.2,
      pan: sideOf(step) * 1.6,
    });
  }

  for (const step of OFF_BEATS) {
    put(stem, "Music", hat(stem.chance, 0.18), {
      at: from + step * STEP_SECONDS,
      gain: 0.16,
      pan: -0.3,
    });
  }
};

const ROLLS = [
  { every: 1, steps: 2 },
  { every: 0.5, steps: 2 },
];

const rolled = (stem: Stem) => {
  let step = 0;

  for (const roll of ROLLS) {
    const count = Math.round(roll.steps / roll.every);

    for (let index = 0; index < count; index += 1) {
      const along = step + index * roll.every;

      put(stem, "Music", snare(stem.chance), {
        at: BEAT_SECONDS * ROLL_BEAT + along * STEP_SECONDS,
        gain: 0.25 + 0.05 * along,
        wet: 0.25,
      });
    }

    step += roll.steps;
  }
};

const mixedDown = (stem: Stem, level: number): Stereo => {
  const mix = stereoOf(stem.send.left.length / SOUND_RATE);

  added(mix, stem.parts.Drums, level);
  added(mix, stem.parts.Music, level);
  added(mix, roomOf(stem.send, ROOM), WET * level);

  return mix;
};

const laidWhole = (scoring: Scoring, mix: Stereo, at: number) => {
  scoring.lay("Hits", mix.left, { at, gain: Math.SQRT1_2, pan: -1 });
  scoring.lay("Hits", mix.right, { at, gain: Math.SQRT1_2, pan: 1 });
};

const TAPE_BEATS = 1.25;

const PRE_LEVEL = 0.62;

const windUpOf = (times: ScoreTimes) => times.pause ?? times.build;

const driftBed = (scoring: Scoring) => {
  const windUp = windUpOf(scoring.times);
  const stem = stemOf(windUp + BEAT_SECONDS * BEATS_IN_BAR, scoring.chance);

  opened(stem);

  for (const bar of [0, 1, 2]) {
    built(stem, bar, BEAT_SECONDS * (BUILD_BEAT + bar * BEATS_IN_BAR));
  }

  for (const part of [stem.parts.Drums, stem.parts.Music]) {
    repeated(part, BEAT_SECONDS * ROLL_BEAT, STEP_SECONDS, STEPS_IN_BEAT);
    tapeStopped(part, windUp, BEAT_SECONDS * TAPE_BEATS);
  }

  rolled(stem);
  put(stem, "Music", riser(stem.chance, BEAT_SECONDS * BEATS_IN_BAR, 7000), {
    at: windUp - BEAT_SECONDS * BEATS_IN_BAR,
    gain: 0.3,
    wet: 0.2,
  });
  ducked(
    stem.parts.Music,
    stem.kicks.filter((at) => at < windUp),
    PUMP
  );
  laidWhole(scoring, mixedDown(stem, PRE_LEVEL), 0);
};

const HIT_WET = 0.4;

const driftPause = (scoring: Scoring, from: number, to: number) => {
  const { chance, lay } = scoring;

  lay("Hits", boom(BEAT_SECONDS * 3), {
    at: from,
    gain: 0.62,
    wet: HIT_WET,
  });
  lay("Hits", riser(chance, BEAT_SECONDS * 2, 9000), {
    at: from + BEAT_SECONDS,
    gain: 0.56,
    wet: 0.2,
  });
  lay("Hits", suckIn(chance, BEAT_SECONDS / 2), {
    at: to - BEAT_SECONDS / 2,
    gain: 0.56,
  });
};

const driftHit = ({ chance, lay }: Scoring, at: number) => {
  lay("Hits", boom(1.2), { at, gain: 0.35 });
  lay("Hits", crash(chance, 1.6), { at, gain: 0.6, wet: HIT_WET });
};

const driftAftermath = (scoring: Scoring) => {
  const { hit, length } = scoring.times;

  if (hit === null) {
    return;
  }

  const seconds = length - hit;
  const stem = stemOf(seconds, scoring.chance);
  const bars = Math.ceil(seconds / (BEAT_SECONDS * BEATS_IN_BAR));
  const quiet = seconds - BEAT_SECONDS;

  for (let bar = 0; bar < bars; bar += 1) {
    dropped(stem, bar, BEAT_SECONDS * BEATS_IN_BAR * bar);
  }

  silenced(stem.parts.Drums, quiet, seconds);
  ducked(
    stem.parts.Music,
    stem.kicks.filter((at) => at < quiet),
    PUMP
  );
  laidWhole(scoring, mixedDown(stem, 1), hit);
};

const COUNT_STEPS = 12;

const COUNT_BEATS = 1.5;

const driftSting = ({ lay, times }: Scoring) => {
  lay("Hits", counter(BEAT_SECONDS * COUNT_BEATS, COUNT_STEPS), {
    at: times.result,
    gain: 0.44,
    wet: 0.2,
  });
};

const FALLS = { Loss: 0.5, Split: 1, Win: 2 } as const;

const driftTag = ({ lay, sheet, times }: Scoring) => {
  const from = hertz(74);

  lay("Hits", slap808(26, BEAT_SECONDS * 2.5, 8), {
    at: times.tag,
    gain: 0.45,
  });
  lay("Hits", cowbell(86, 0.5, 3), { at: times.tag, gain: 0.8, wet: 0.6 });
  lay(
    "Hits",
    scaled(
      contoured(
        tone(
          "Square",
          glide(from, from * FALLS[sheet.outcome], BEAT_SECONDS * 1.5),
          BEAT_SECONDS * 2
        ),
        struck(0.004, BEAT_SECONDS * 2)
      ),
      0.5
    ),
    { at: times.tag, gain: 0.32, wet: 0.6 }
  );
};

const SNAP: SmallLook = {
  card: 4200,
  chipHigh: 5600,
  chipLow: 3000,
  knock: 220,
};

const driftSmall = ({ chance, lay }: Scoring, cue: SmallCue) => {
  const at = cue.atMs / 1000;

  const whoosh = () => {
    lay("Hits", swish(chance), {
      at: Math.max(0, at - 0.06),
      gain: 0.6,
      pan: cue.pan,
      wet: 0.2,
    });
  };

  const sounds: Readonly<Partial<Record<SmallSound, () => void>>> = {
    AllIn: whoosh,
    Card: () => {
      lay("Hits", cardSnap(chance, SNAP), {
        at,
        gain: 1,
        pan: cue.pan,
        wet: 0.2,
      });
      lay("Hits", thump(210, 90, 0.1), { at, gain: 0.6 });
    },
    Fold: whoosh,
    Stamp: whoosh,
  };

  sounds[cue.kind]?.();
};

const DRIVEN_AT = -12;

const DRIVE = 1.7;

const AIR_ABOVE = 12_500;

const driftColoured = (mix: Stereo, times: ScoreTimes) => {
  if (times.hit !== null) {
    silenced(mix, times.hit - BEAT_SECONDS, times.hit - BEAT_SECONDS / 2);
  }

  ridden(mix, steady(gainOf(DRIVEN_AT - integratedLoudness(mix))));
  saturated(mix, DRIVE);
  filtered(mix.left, "Low", steady(AIR_ABOVE));
  filtered(mix.right, "Low", steady(AIR_ABOVE));
};

export const DRIFT: ScoreKit = {
  aftermath: driftAftermath,
  bed: driftBed,
  hit: driftHit,
  lean: 0,
  master: {
    ceiling: DRIFT_CEILING,
    coloured: driftColoured,
    loudness: DRIFT_LOUDNESS,
    tail: 0.03,
    truePeak: DRIFT_TRUE_PEAK,
  },
  pause: driftPause,
  room: ROOM,
  small: driftSmall,
  sting: driftSting,
  tag: driftTag,
  wet: WET,
};
