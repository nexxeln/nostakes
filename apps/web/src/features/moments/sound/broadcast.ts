import {
  contoured,
  driven,
  filtered,
  glide,
  held,
  hertz,
  scaled,
  steady,
  struck,
  summed,
  tone,
} from "./dsp.js";
import type { Mono } from "./dsp.js";
import {
  air,
  bell,
  blip,
  brass,
  cardSnap,
  chipRun,
  kick,
  knock,
  riser,
  stamp,
  strings,
  swish,
  thump,
  tick,
} from "./kit.js";
import type { SmallLook } from "./kit.js";
import { gridOf, tensionAt } from "./mix.js";
import { LOUDNESS_TARGET, PEAK_CEILING } from "./sheet.js";
import type { ScoreKit, Scoring, SmallCue, SmallSound } from "./sheet.js";

const BROADCAST_BEAT = 60 / 96;

const BROADCAST_BASS = [50, 50, 53, 50, 50, 50, 45, 48];

const bassNote = (midi: number, seconds: number, cutoff: number): Mono =>
  contoured(
    driven(
      filtered(
        summed([
          tone("Saw", steady(hertz(midi)), seconds),
          tone("Saw", steady(hertz(midi + 12)), seconds),
        ]),
        "Low",
        (time) => cutoff * (0.45 + 0.55 * Math.exp(-time * 14)),
        1.6
      ),
      3
    ),
    held(0.004, seconds * 0.6, seconds * 0.38)
  );

const broadcastBed = ({ chance, lay, times }: Scoring) => {
  const grid = gridOf(0, times.build, BROADCAST_BEAT);

  lay("Bed", thump(84, 36, 0.6), { at: 0, gain: 0.5, wet: 0.3 });
  lay("Bed", bell(hertz(69), 1.6), { at: 0, gain: 0.12, wet: 0.8 });

  for (const [index, at] of grid.beats.entries()) {
    const level = tensionAt(times, at);

    lay("Bed", kick(chance, 0.5), {
      at,
      gain: 0.5 + 0.35 * level,
      wet: 0.06,
    });

    for (const half of [0, 1]) {
      lay(
        "Bed",
        bassNote(
          BROADCAST_BASS[(index * 2 + half) % BROADCAST_BASS.length] ?? 50,
          grid.beat * 0.46,
          260 + 1500 * level
        ),
        { at: at + (half * grid.beat) / 2, gain: 0.4 + 0.14 * level }
      );
    }

    if (level > 0.42) {
      for (const quarter of [0, 1, 2, 3]) {
        lay("Bed", tick(chance, 6500, 0.014, 3), {
          at: at + (quarter * grid.beat) / 4,
          gain: (quarter === 0 ? 0.24 : 0.14) * level,
          pan: quarter % 2 === 0 ? -0.4 : 0.4,
          wet: 0.2,
        });
      }
    }

    if (index % 4 === 0) {
      const seconds = Math.min(times.build - at, grid.beat * 4) + 0.25;

      lay(
        "Bed",
        strings(level > 0.62 ? [50, 53, 57, 64] : [50, 53, 57], seconds, {
          attack: 0.35,
          cutoff: steady(500 + 2000 * level),
          release: 0.25,
        }),
        { at, gain: 0.05 + 0.07 * level, pan: -0.25, wet: 0.7 }
      );
      lay(
        "Bed",
        strings([62, 69], seconds, {
          attack: 0.5,
          cutoff: steady(700 + 2400 * level),
          release: 0.25,
        }),
        { at, gain: 0.03 + 0.05 * level, pan: 0.3, wet: 0.7 }
      );
    }

    if (index % 4 === 0 && level > 0.7) {
      lay(
        "Bed",
        strings([62, 65, 69], 0.16, {
          attack: 0.005,
          cutoff: steady(3200),
          release: 0.1,
        }),
        { at, gain: 0.16, wet: 0.4 }
      );
    }
  }

  if (times.pause !== null) {
    const seconds = Math.min(1.9, times.pause);

    lay("Bed", riser(chance, seconds, 7500), {
      at: times.pause - seconds,
      gain: 0.5,
      wet: 0.25,
    });
  }
};

const broadcastPause = ({ lay }: Scoring, from: number, to: number) => {
  for (let at = from + 0.3; at < to - 0.35; at += 0.92) {
    lay(
      "Hits",
      summed([thump(72, 42, 0.16), scaled(thump(190, 120, 0.05), 0.3)]),
      {
        at,
        gain: 0.16,
      }
    );
    lay(
      "Hits",
      summed([thump(64, 40, 0.14), scaled(thump(170, 110, 0.05), 0.3)]),
      {
        at: at + 0.27,
        gain: 0.11,
      }
    );
  }
};

const impact = ({ chance, lay }: Scoring, at: number, weight: number) => {
  lay(
    "Hits",
    contoured(tone("Sine", glide(92, 34, 0.5), 1.1), struck(0.003, 1.1)),
    { at, gain: 0.6 * weight, wet: 0.1 }
  );
  lay(
    "Hits",
    contoured(
      driven(tone("Triangle", glide(240, 96, 0.25), 0.5), 2.5),
      struck(0.002, 0.45)
    ),
    { at, gain: 0.9 * weight, wet: 0.2 }
  );
  lay(
    "Hits",
    contoured(
      air(chance, "Low", glide(1800, 260, 0.5), 0.9),
      struck(0.002, 0.8)
    ),
    { at, gain: 0.6 * weight, wet: 0.5 }
  );
  lay(
    "Hits",
    contoured(
      air(chance, "Band", glide(1400, 600, 0.2), 0.3, 0.8),
      struck(0.001, 0.26)
    ),
    { at, gain: 1.3 * weight, wet: 0.4 }
  );
  lay("Hits", tick(chance, 2800, 0.03, 0.9), {
    at,
    gain: 0.8 * weight,
    wet: 0.4,
  });
};

const broadcastHit = (scoring: Scoring, at: number) => {
  const { lay } = scoring;

  impact(scoring, at, 1);
  lay(
    "Hits",
    contoured(
      filtered(
        summed(
          [38, 45, 50, 57].map((midi) => tone("Saw", steady(hertz(midi)), 1.8))
        ),
        "Low",
        glide(2600, 320, 1.4),
        1.2
      ),
      struck(0.01, 1.7)
    ),
    { at, gain: 0.22, wet: 0.6 }
  );

  for (const [index, ratio] of [1, 1.41, 2.09, 2.83].entries()) {
    lay(
      "Hits",
      contoured(
        tone("Sine", steady(311 * ratio), 1.4),
        struck(0.002, 1.4 - index * 0.25)
      ),
      { at, gain: 0.05, pan: index % 2 === 0 ? -0.5 : 0.5, wet: 0.8 }
    );
  }
};

const broadcastAftermath = ({ chance, lay, times }: Scoring) => {
  if (times.hit === null || times.result - times.hit < BROADCAST_BEAT * 2) {
    return;
  }

  const grid = gridOf(times.hit + BROADCAST_BEAT, times.result, BROADCAST_BEAT);

  for (const [index, at] of grid.beats.entries()) {
    if (index % 2 === 0) {
      lay("Bed", kick(chance, 1), { at, gain: 0.5, wet: 0.06 });
    }

    lay("Bed", bassNote(50, grid.beat * 0.4, 500), { at, gain: 0.3 });
    lay("Bed", tick(chance, 6500, 0.014, 3), {
      at: at + grid.beat / 2,
      gain: 0.07,
      pan: 0.3,
      wet: 0.2,
    });
  }

  lay(
    "Bed",
    strings([50, 57, 62], times.result - times.hit - BROADCAST_BEAT + 0.2, {
      attack: 0.6,
      cutoff: steady(1200),
      release: 0.3,
    }),
    { at: times.hit + BROADCAST_BEAT, gain: 0.08, wet: 0.7 }
  );
};

const broadcastSting = ({ chance, lay, sheet, times }: Scoring) => {
  const at = times.result;

  if (sheet.outcome === "Loss") {
    lay("Hits", kick(chance, 1.2), { at, gain: 0.8, wet: 0.2 });

    for (const [index, midi] of [53, 52, 50].entries()) {
      const last = index === 2;

      lay(
        "Hits",
        summed([
          brass(midi, last ? 1.3 : 0.3, { bright: 1600, fall: last ? 1 : 0 }),
          scaled(
            brass(midi - 12, last ? 1.3 : 0.3, { bright: 900, fall: 0 }),
            0.7
          ),
        ]),
        { at: at + 0.08 + index * 0.27, gain: 0.26, wet: 0.5 }
      );
    }

    return;
  }

  if (sheet.outcome === "Split") {
    for (const [index, midi] of [57, 62].entries()) {
      lay("Hits", bell(hertz(midi + 12), 1.4), {
        at: at + index * 0.22,
        gain: 0.2,
        pan: index === 0 ? -0.3 : 0.3,
        wet: 0.6,
      });
    }

    lay(
      "Hits",
      strings([50, 57, 62], 1.4, {
        attack: 0.1,
        cutoff: steady(1800),
        release: 0.6,
      }),
      {
        at,
        gain: 0.12,
        wet: 0.6,
      }
    );

    return;
  }

  lay("Hits", kick(chance, 1.2), { at, gain: 0.8, wet: 0.2 });

  for (const [index, midi] of [50, 57, 62, 66].entries()) {
    lay("Hits", brass(midi, 0.2, { bright: 2600, fall: 0 }), {
      at: at + index * 0.1,
      gain: 0.2,
      wet: 0.4,
    });
  }

  lay(
    "Hits",
    summed(
      [62, 66, 69, 74].map((midi) =>
        brass(midi, 1.2, { bright: 3200, fall: 0 })
      )
    ),
    { at: at + 0.4, gain: 0.13, wet: 0.6 }
  );
  lay(
    "Hits",
    contoured(air(chance, "High", steady(5000), 1.3), (time) =>
      time < 0.4 ? time / 0.4 : Math.exp(-(time - 0.4) * 4)
    ),
    { at: at + 0.05, gain: 0.16, wet: 0.5 }
  );
};

const broadcastTag = ({ chance, lay, times }: Scoring) => {
  lay("Hits", stamp(chance), { at: times.tag, gain: 0.5, wet: 0.2 });

  for (const [index, midi] of [69, 74].entries()) {
    lay("Hits", bell(hertz(midi), 1.6), {
      at: times.tag + 0.12 + index * 0.2,
      gain: 0.2,
      pan: index === 0 ? -0.25 : 0.25,
      wet: 0.7,
    });
  }

  lay("Hits", thump(74, 37, 0.5), { at: times.tag + 0.32, gain: 0.5 });
};

const SMALL: SmallLook = {
  card: 3200,
  chipHigh: 5200,
  chipLow: 2600,
  knock: 200,
};

const SMALL_WET = 0.25;

const broadcastSmall = ({ chance, lay }: Scoring, cue: SmallCue) => {
  const place = { at: cue.atMs / 1000, pan: cue.pan, wet: SMALL_WET };

  const sounds: Readonly<Record<SmallSound, () => void>> = {
    AllIn: () => {
      lay("Hits", chipRun(chance, SMALL, 14), { ...place, gain: 0.34 });
      lay("Hits", thump(140, 60, 0.2), { ...place, gain: 0.4 });
    },
    Bar: () => {
      lay("Hits", blip(660, 990), { ...place, gain: 0.12 });
    },
    Card: () => {
      lay("Hits", cardSnap(chance, SMALL), { ...place, gain: 0.5 });
    },
    Check: () => {
      lay("Hits", knock(chance, SMALL), { ...place, gain: 0.4 });
    },
    Chips: () => {
      lay("Hits", chipRun(chance, SMALL, 6), { ...place, gain: 0.3 });
    },
    Fold: () => {
      lay("Hits", swish(chance), { ...place, gain: 0.3 });
    },
    Stamp: () => {
      lay("Hits", stamp(chance), { ...place, gain: 0.4 });
    },
  };

  sounds[cue.kind]();
};

export const BROADCAST: ScoreKit = {
  aftermath: broadcastAftermath,
  bed: broadcastBed,
  hit: broadcastHit,
  lean: 0.5,
  master: { ceiling: PEAK_CEILING, loudness: LOUDNESS_TARGET, tail: 0.4 },
  pause: broadcastPause,
  room: { damp: 0.35, size: 0.86 },
  small: broadcastSmall,
  sting: broadcastSting,
  tag: broadcastTag,
  wet: 1,
};
