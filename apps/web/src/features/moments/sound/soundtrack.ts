import {
  added,
  chanceFrom,
  contoured,
  driven,
  filtered,
  glide,
  held,
  hertz,
  laid,
  mastered,
  ramp,
  ridden,
  roomOf,
  scaled,
  spliced,
  steady,
  stereoOf,
  struck,
  summed,
  tone,
} from "./dsp.js";
import type { Chance, Mono, Stereo } from "./dsp.js";
import {
  air,
  bell,
  blip,
  brass,
  cardSnap,
  chipRun,
  keys,
  kick,
  knock,
  riser,
  stamp,
  string,
  strings,
  swish,
  thump,
  tick,
  upright,
} from "./kit.js";
import type { SmallLook } from "./kit.js";
import { LOUDNESS_TARGET, PEAK_CEILING } from "./sheet.js";
import type { PaletteName, ScoreSheet, SmallCue } from "./sheet.js";

interface Desk {
  readonly bed: Stereo;
  readonly chance: Chance;
  readonly fx: Stereo;
  readonly send: Stereo;
}

interface Place {
  readonly at: number;
  readonly gain: number;
  readonly pan?: number;
  readonly wet?: number;
}

const put = (desk: Desk, bus: "Bed" | "Fx", sound: Mono, place: Place) => {
  const pan = place.pan ?? 0;

  laid(bus === "Bed" ? desk.bed : desk.fx, sound, {
    at: place.at,
    gain: place.gain,
    pan,
  });

  if ((place.wet ?? 0) > 0) {
    laid(desk.send, sound, {
      at: place.at,
      gain: place.gain * (place.wet ?? 0),
      pan,
    });
  }
};

interface Times {
  readonly build: number;
  readonly hit: number | null;
  readonly length: number;
  readonly pause: number | null;
  readonly result: number;
  readonly tag: number;
}

const timesOf = (sheet: ScoreSheet): Times => ({
  build: (sheet.pauseMs ?? sheet.resultMs) / 1000,
  hit: sheet.hitMs === null ? null : sheet.hitMs / 1000,
  length: sheet.lengthMs / 1000,
  pause: sheet.pauseMs === null ? null : sheet.pauseMs / 1000,
  result: sheet.resultMs / 1000,
  tag: sheet.tagMs / 1000,
});

const QUIET_START = 0.3;

const tensionAt = (times: Times, at: number) => {
  const along = Math.min(1, Math.max(0, at / Math.max(0.5, times.build)));

  return QUIET_START + (1 - QUIET_START) * along * along * (3 - 2 * along);
};

interface Grid {
  readonly beat: number;
  readonly beats: readonly number[];
}

const gridOf = (from: number, to: number, beat: number): Grid => {
  const count = Math.max(1, Math.round((to - from) / beat));
  const fitted = (to - from) / count;

  return {
    beat: fitted,
    beats: Array.from({ length: count }, (_, index) => from + index * fitted),
  };
};

interface Arrangement {
  readonly desk: Desk;
  readonly sheet: ScoreSheet;
  readonly times: Times;
}

interface Palette {
  readonly aftermath: (arrangement: Arrangement) => void;
  readonly bed: (arrangement: Arrangement) => void;
  readonly hit: (arrangement: Arrangement, at: number) => void;
  readonly pause: (arrangement: Arrangement, from: number, to: number) => void;
  readonly room: { readonly damp: number; readonly size: number };
  readonly small: SmallLook;
  readonly smallWet: number;
  readonly sting: (arrangement: Arrangement) => void;
  readonly tag: (arrangement: Arrangement) => void;
  readonly wet: number;
}

const BROADCAST_BEAT = 60 / 96;

const BROADCAST_BASS = [38, 38, 41, 38, 38, 38, 33, 36];

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

const broadcastBed = ({ desk, times }: Arrangement) => {
  const grid = gridOf(0, times.build, BROADCAST_BEAT);

  for (const [index, at] of grid.beats.entries()) {
    const level = tensionAt(times, at);

    put(desk, "Bed", kick(desk.chance, 0.5), {
      at,
      gain: 0.5 + 0.35 * level,
      wet: 0.06,
    });

    for (const half of [0, 1]) {
      put(
        desk,
        "Bed",
        bassNote(
          BROADCAST_BASS[(index * 2 + half) % BROADCAST_BASS.length] ?? 38,
          grid.beat * 0.46,
          260 + 1500 * level
        ),
        { at: at + (half * grid.beat) / 2, gain: 0.4 + 0.14 * level }
      );
    }

    if (level > 0.42) {
      for (const quarter of [0, 1, 2, 3]) {
        put(desk, "Bed", tick(desk.chance, 6500, 0.014, 3), {
          at: at + (quarter * grid.beat) / 4,
          gain: (quarter === 0 ? 0.24 : 0.14) * level,
          pan: quarter % 2 === 0 ? -0.4 : 0.4,
          wet: 0.2,
        });
      }
    }

    if (index % 4 === 0) {
      const seconds = Math.min(times.build - at, grid.beat * 4) + 0.25;

      put(
        desk,
        "Bed",
        strings(level > 0.62 ? [50, 53, 57, 64] : [50, 53, 57], seconds, {
          attack: 0.35,
          cutoff: steady(500 + 2000 * level),
          release: 0.25,
        }),
        { at, gain: 0.05 + 0.07 * level, pan: -0.25, wet: 0.7 }
      );
      put(
        desk,
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
      put(
        desk,
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

    put(desk, "Bed", riser(desk.chance, seconds, 7500), {
      at: times.pause - seconds,
      gain: 0.5,
      wet: 0.25,
    });
  }
};

const broadcastPause = ({ desk }: Arrangement, from: number, to: number) => {
  for (let at = from + 0.3; at < to - 0.35; at += 0.92) {
    put(
      desk,
      "Fx",
      summed([thump(72, 42, 0.16), scaled(thump(190, 120, 0.05), 0.3)]),
      {
        at,
        gain: 0.16,
      }
    );
    put(
      desk,
      "Fx",
      summed([thump(64, 40, 0.14), scaled(thump(170, 110, 0.05), 0.3)]),
      {
        at: at + 0.27,
        gain: 0.11,
      }
    );
  }
};

const impact = (desk: Desk, at: number, weight: number) => {
  put(
    desk,
    "Fx",
    contoured(tone("Sine", glide(92, 34, 0.5), 1.1), struck(0.003, 1.1)),
    { at, gain: 0.6 * weight, wet: 0.1 }
  );
  put(
    desk,
    "Fx",
    contoured(
      driven(tone("Triangle", glide(240, 96, 0.25), 0.5), 2.5),
      struck(0.002, 0.45)
    ),
    { at, gain: 0.9 * weight, wet: 0.2 }
  );
  put(
    desk,
    "Fx",
    contoured(
      air(desk.chance, "Low", glide(1800, 260, 0.5), 0.9),
      struck(0.002, 0.8)
    ),
    { at, gain: 0.6 * weight, wet: 0.5 }
  );
  put(
    desk,
    "Fx",
    contoured(
      air(desk.chance, "Band", glide(1400, 600, 0.2), 0.3, 0.8),
      struck(0.001, 0.26)
    ),
    { at, gain: 1.3 * weight, wet: 0.4 }
  );
  put(desk, "Fx", tick(desk.chance, 2800, 0.03, 0.9), {
    at,
    gain: 0.8 * weight,
    wet: 0.4,
  });
};

const broadcastHit = ({ desk }: Arrangement, at: number) => {
  impact(desk, at, 1);
  put(
    desk,
    "Fx",
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
    put(
      desk,
      "Fx",
      contoured(
        tone("Sine", steady(311 * ratio), 1.4),
        struck(0.002, 1.4 - index * 0.25)
      ),
      { at, gain: 0.05, pan: index % 2 === 0 ? -0.5 : 0.5, wet: 0.8 }
    );
  }
};

const broadcastAftermath = ({ desk, times }: Arrangement) => {
  if (times.hit === null || times.result - times.hit < BROADCAST_BEAT * 2) {
    return;
  }

  const grid = gridOf(times.hit + BROADCAST_BEAT, times.result, BROADCAST_BEAT);

  for (const [index, at] of grid.beats.entries()) {
    if (index % 2 === 0) {
      put(desk, "Bed", kick(desk.chance, 1), { at, gain: 0.5, wet: 0.06 });
    }

    put(desk, "Bed", bassNote(38, grid.beat * 0.4, 500), { at, gain: 0.3 });
    put(desk, "Bed", tick(desk.chance, 6500, 0.014, 3), {
      at: at + grid.beat / 2,
      gain: 0.07,
      pan: 0.3,
      wet: 0.2,
    });
  }

  put(
    desk,
    "Bed",
    strings([50, 57, 62], times.result - times.hit - BROADCAST_BEAT + 0.2, {
      attack: 0.6,
      cutoff: steady(1200),
      release: 0.3,
    }),
    { at: times.hit + BROADCAST_BEAT, gain: 0.08, wet: 0.7 }
  );
};

const broadcastSting = ({ desk, sheet, times }: Arrangement) => {
  const at = times.result;

  if (sheet.outcome === "Loss") {
    put(desk, "Fx", kick(desk.chance, 1.2), { at, gain: 0.8, wet: 0.2 });

    for (const [index, midi] of [53, 52, 50].entries()) {
      const last = index === 2;

      put(
        desk,
        "Fx",
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
      put(desk, "Fx", bell(hertz(midi + 12), 1.4), {
        at: at + index * 0.22,
        gain: 0.2,
        pan: index === 0 ? -0.3 : 0.3,
        wet: 0.6,
      });
    }

    put(
      desk,
      "Fx",
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

  put(desk, "Fx", kick(desk.chance, 1.2), { at, gain: 0.8, wet: 0.2 });

  for (const [index, midi] of [50, 57, 62, 66].entries()) {
    put(desk, "Fx", brass(midi, 0.2, { bright: 2600, fall: 0 }), {
      at: at + index * 0.1,
      gain: 0.2,
      wet: 0.4,
    });
  }

  put(
    desk,
    "Fx",
    summed(
      [62, 66, 69, 74].map((midi) =>
        brass(midi, 1.2, { bright: 3200, fall: 0 })
      )
    ),
    { at: at + 0.4, gain: 0.13, wet: 0.6 }
  );
  put(
    desk,
    "Fx",
    contoured(air(desk.chance, "High", steady(5000), 1.3), (time) =>
      time < 0.4 ? time / 0.4 : Math.exp(-(time - 0.4) * 4)
    ),
    { at: at + 0.05, gain: 0.16, wet: 0.5 }
  );
};

const broadcastTag = ({ desk, times }: Arrangement) => {
  put(desk, "Fx", stamp(desk.chance), { at: times.tag, gain: 0.5, wet: 0.2 });

  for (const [index, midi] of [69, 74].entries()) {
    put(desk, "Fx", bell(hertz(midi), 1.6), {
      at: times.tag + 0.12 + index * 0.2,
      gain: 0.2,
      pan: index === 0 ? -0.25 : 0.25,
      wet: 0.7,
    });
  }

  put(desk, "Fx", thump(74, 37, 0.5), { at: times.tag + 0.32, gain: 0.5 });
};

const BROADCAST: Palette = {
  aftermath: broadcastAftermath,
  bed: broadcastBed,
  hit: broadcastHit,
  pause: broadcastPause,
  room: { damp: 0.35, size: 0.86 },
  small: { card: 3200, chipHigh: 5200, chipLow: 2600, knock: 200 },
  smallWet: 0.25,
  sting: broadcastSting,
  tag: broadcastTag,
  wet: 1,
};

const PAPER_BEAT = 60 / 116;

const PAPER_TUNE = [60, 64, 67, 64, 69, 67, 64, 67];

const PAPER_HIGH = [72, 76, 79, 76, 81, 79, 76, 79];

const bongo = (chance: Chance, high: boolean): Mono =>
  summed([
    thump(high ? 430 : 290, high ? 330 : 205, 0.11),
    scaled(tick(chance, high ? 1900 : 1300, 0.012, 1.5), 0.3),
  ]);

const shaker = (chance: Chance, seconds: number): Mono =>
  contoured(
    air(chance, "High", steady(6000), seconds),
    held(0.008, 0, seconds - 0.008)
  );

const clap = (chance: Chance): Mono =>
  spliced(
    [0, 0.011, 0.023].map((at) => ({
      at,
      sound: scaled(
        contoured(
          air(chance, "Band", steady(1300), 0.08, 1.2),
          struck(0.001, 0.08)
        ),
        at === 0.023 ? 1 : 0.6
      ),
    }))
  );

const woodblock = (chance: Chance, pitch: number): Mono =>
  summed([
    contoured(
      tone("Sine", glide(pitch, pitch * 0.86, 0.03), 0.06),
      struck(0.001, 0.05)
    ),
    scaled(tick(chance, pitch * 1.6, 0.012, 4), 0.4),
  ]);

interface Pulse {
  readonly at: number;
  readonly beat: number;
  readonly index: number;
  readonly level: number;
}

const LILT = 1.12;

const paperTune = (desk: Desk, { at, beat, index, level }: Pulse) => {
  for (const step of [0, 1]) {
    const place = (index * 2 + step) % PAPER_TUNE.length;
    const when = at + (step * beat * (step === 1 ? LILT : 1)) / 2;

    put(desk, "Bed", string(PAPER_TUNE[place] ?? 60, 0.5, desk.chance), {
      at: when,
      gain: 0.34 + 0.1 * level,
      pan: -0.2,
      wet: 0.3,
    });

    if (level > 0.6) {
      put(desk, "Bed", string(PAPER_HIGH[place] ?? 72, 0.4, desk.chance, 0.7), {
        at: when,
        gain: 0.16 * level,
        pan: 0.35,
        wet: 0.4,
      });
    }
  }
};

const paperClimb = (desk: Desk, { at, beat }: Pulse, rung: number) => {
  for (const step of [0, 1, 2, 3]) {
    put(desk, "Bed", string(59 + rung * 4 + step, 0.3, desk.chance, 0.7), {
      at: at + (step * beat) / 4,
      gain: 0.3 + 0.05 * step + 0.12 * rung,
      pan: -0.3 + 0.15 * step,
      wet: 0.3,
    });
  }
};

const paperDrums = (desk: Desk, { at, beat, index, level }: Pulse) => {
  const off = at + (beat * LILT) / 2;

  put(desk, "Bed", upright(index % 4 < 2 ? 36 : 43, 0.5, desk.chance), {
    at,
    gain: index % 2 === 0 ? 0.42 : 0.24,
    wet: 0.1,
  });
  put(desk, "Bed", bongo(desk.chance, false), {
    at,
    gain: index % 2 === 0 ? 0.3 : 0.16,
    pan: 0.3,
    wet: 0.2,
  });
  put(desk, "Bed", bongo(desk.chance, true), {
    at: off,
    gain: index % 4 === 3 ? 0.3 : 0.2,
    pan: 0.45,
    wet: 0.2,
  });
  put(desk, "Bed", shaker(desk.chance, 0.05), {
    at,
    gain: 0.06 * (0.5 + level),
    pan: -0.5,
    wet: 0.1,
  });
  put(desk, "Bed", shaker(desk.chance, 0.05), {
    at: off,
    gain: 0.1 * (0.5 + level),
    pan: -0.5,
    wet: 0.1,
  });

  if (index % 4 === 3 && level > 0.5) {
    put(desk, "Bed", bongo(desk.chance, true), {
      at: at + beat * 0.78,
      gain: 0.22,
      pan: 0.45,
      wet: 0.2,
    });
  }

  if (index % 4 === 3 && level > 0.7) {
    put(desk, "Bed", clap(desk.chance), { at, gain: 0.22, pan: 0.1, wet: 0.3 });
  }
};

const paperRoll = (desk: Desk, from: number, seconds: number) => {
  for (let step = 0; step < 16; step += 1) {
    put(desk, "Bed", shaker(desk.chance, 0.04), {
      at: from + (step * seconds) / 16,
      gain: 0.05 + 0.012 * step,
      pan: -0.5,
      wet: 0.1,
    });
  }
};

const paperBed = ({ desk, times }: Arrangement) => {
  const grid = gridOf(0, times.build, PAPER_BEAT);

  const climb =
    times.pause === null ? grid.beats.length : grid.beats.length - 2;

  for (const [index, at] of grid.beats.entries()) {
    const pulse = { at, beat: grid.beat, index, level: tensionAt(times, at) };

    if (index < climb) {
      paperTune(desk, pulse);
    } else {
      paperClimb(desk, pulse, index - climb);
    }

    paperDrums(desk, pulse);
  }

  if (times.pause !== null) {
    const seconds = Math.min(grid.beat * 2, times.pause);

    paperRoll(desk, times.pause - seconds, seconds);
  }
};

const paperPause = ({ desk }: Arrangement, from: number, to: number) => {
  let high = true;

  for (let at = from + 0.35; at < to - 0.3; at += 0.5) {
    put(desk, "Fx", woodblock(desk.chance, high ? 1500 : 1150), {
      at,
      gain: 0.07,
      pan: high ? -0.2 : 0.2,
      wet: 0.5,
    });
    high = !high;
  }
};

const boing = (): Mono =>
  contoured(
    tone(
      "Triangle",
      (time) =>
        (260 + 420 * Math.exp(-time * 5) * Math.abs(Math.sin(time * 34))) *
        (1 + 0.04 * Math.sin(time * 70)),
      0.55
    ),
    struck(0.004, 0.5)
  );

const strum = (
  desk: Desk,
  midis: readonly number[],
  at: number,
  gain: number
) => {
  for (const [index, midi] of midis.entries()) {
    put(desk, "Fx", string(midi, 1.1, desk.chance, 0.75), {
      at: at + index * 0.018,
      gain,
      pan: -0.4 + (0.8 * index) / Math.max(1, midis.length - 1),
      wet: 0.5,
    });
  }
};

const paperHit = ({ desk }: Arrangement, at: number) => {
  put(
    desk,
    "Fx",
    summed([thump(190, 62, 0.3), scaled(thump(380, 200, 0.08), 0.5)]),
    {
      at,
      gain: 0.9,
      wet: 0.2,
    }
  );
  put(desk, "Fx", boing(), { at: at + 0.02, gain: 0.3, pan: 0.2, wet: 0.3 });
  put(
    desk,
    "Fx",
    contoured(air(desk.chance, "High", steady(4200), 0.7), struck(0.001, 0.6)),
    { at, gain: 0.28, pan: -0.2, wet: 0.5 }
  );
  put(desk, "Fx", clap(desk.chance), { at, gain: 0.4, wet: 0.4 });
  strum(desk, [48, 60, 64, 67, 72], at, 0.3);
};

const paperAftermath = ({ desk, times }: Arrangement) => {
  if (times.hit === null || times.result - times.hit < PAPER_BEAT * 2) {
    return;
  }

  const grid = gridOf(times.hit + PAPER_BEAT, times.result, PAPER_BEAT);

  for (const [index, at] of grid.beats.entries()) {
    put(
      desk,
      "Bed",
      string(
        PAPER_TUNE[(index * 2) % PAPER_TUNE.length] ?? 60,
        0.5,
        desk.chance
      ),
      {
        at,
        gain: 0.3,
        pan: -0.2,
        wet: 0.3,
      }
    );
    put(desk, "Bed", upright(index % 2 === 0 ? 36 : 43, 0.5, desk.chance), {
      at,
      gain: 0.3,
      wet: 0.1,
    });
    put(desk, "Bed", shaker(desk.chance, 0.05), {
      at: at + grid.beat / 2,
      gain: 0.08,
      pan: -0.5,
    });
  }
};

const slideDown = (): Mono =>
  contoured(
    filtered(
      summed([
        tone(
          "Saw",
          (time) =>
            hertz(64) *
            2 ** (-(Math.min(1, time / 0.8) ** 1.5) * 1.4) *
            (1 + 0.012 * Math.sin(time * 36)),
          0.95
        ),
      ]),
      "Band",
      (time) => 900 - 500 * Math.min(1, time / 0.8),
      2.2
    ),
    held(0.04, 0.6, 0.3)
  );

const paperSting = ({ desk, sheet, times }: Arrangement) => {
  const at = times.result;

  if (sheet.outcome === "Loss") {
    for (const [index, midi] of [67, 66, 65].entries()) {
      put(desk, "Fx", string(midi, 0.4, desk.chance, 0.7), {
        at: at + index * 0.17,
        gain: 0.42,
        pan: -0.2 + index * 0.2,
        wet: 0.4,
      });
      put(desk, "Fx", bongo(desk.chance, index !== 2), {
        at: at + index * 0.17,
        gain: 0.2,
        pan: 0.3,
      });
    }

    put(desk, "Fx", slideDown(), { at: at + 0.52, gain: 0.5, wet: 0.4 });
    put(desk, "Fx", summed([thump(150, 60, 0.25)]), {
      at: at + 1.38,
      gain: 0.5,
    });

    return;
  }

  if (sheet.outcome === "Split") {
    for (const [index, midi] of [76, 79, 76].entries()) {
      put(desk, "Fx", string(midi, 0.5, desk.chance, 0.7), {
        at: at + index * 0.14,
        gain: 0.36,
        pan: index === 1 ? 0.3 : -0.3,
        wet: 0.4,
      });
    }

    put(desk, "Fx", woodblock(desk.chance, 1500), {
      at: at + 0.5,
      gain: 0.2,
      pan: -0.3,
    });
    put(desk, "Fx", woodblock(desk.chance, 1150), {
      at: at + 0.64,
      gain: 0.2,
      pan: 0.3,
    });

    return;
  }

  for (const [index, midi] of [72, 76, 79].entries()) {
    put(
      desk,
      "Fx",
      summed([
        string(midi, 0.5, desk.chance, 0.8),
        scaled(
          contoured(
            tone("Square", steady(hertz(midi)), 0.12),
            held(0.005, 0.07, 0.04)
          ),
          0.12
        ),
      ]),
      { at: at + index * 0.1, gain: 0.4, pan: -0.3 + index * 0.3, wet: 0.4 }
    );
  }

  strum(desk, [60, 64, 67, 72, 76, 84], at + 0.34, 0.3);
  put(desk, "Fx", clap(desk.chance), { at: at + 0.34, gain: 0.35, wet: 0.4 });
  put(desk, "Fx", clap(desk.chance), { at: at + 0.56, gain: 0.28, wet: 0.4 });
  put(desk, "Fx", summed([thump(170, 60, 0.25)]), { at: at + 0.34, gain: 0.6 });

  for (let step = 0; step < 10; step += 1) {
    put(desk, "Fx", shaker(desk.chance, 0.04), {
      at: at + 0.34 + step * 0.045,
      gain: 0.12 - step * 0.008,
      pan: -0.5,
    });
  }
};

const paperTag = ({ desk, times }: Arrangement) => {
  put(desk, "Fx", bongo(desk.chance, false), {
    at: times.tag,
    gain: 0.4,
    wet: 0.2,
  });

  for (const [index, midi] of [67, 72, 76].entries()) {
    put(desk, "Fx", string(midi, 0.9, desk.chance, 0.75), {
      at: times.tag + 0.1 + index * 0.11,
      gain: 0.36,
      pan: -0.3 + index * 0.3,
      wet: 0.5,
    });
  }

  put(desk, "Fx", upright(36, 0.8, desk.chance), {
    at: times.tag + 0.43,
    gain: 0.45,
  });
};

const PAPER: Palette = {
  aftermath: paperAftermath,
  bed: paperBed,
  hit: paperHit,
  pause: paperPause,
  room: { damp: 0.5, size: 0.7 },
  small: { card: 2600, chipHigh: 5600, chipLow: 3000, knock: 320 },
  smallWet: 0.3,
  sting: paperSting,
  tag: paperTag,
  wet: 0.8,
};

const ROOM_BEAT = 60 / 126;

const SWING = 2 / 3;

const WALK = [
  41, 45, 48, 50, 51, 50, 48, 45, 46, 50, 53, 55, 56, 55, 53, 50, 41, 45, 48,
  50, 51, 50, 48, 45, 48, 46, 45, 43, 41, 48, 45, 40,
];

const COMP: readonly (readonly number[])[] = [
  [57, 63, 67],
  [57, 63, 67],
  [56, 62, 67],
  [56, 62, 67],
  [57, 63, 67],
  [57, 63, 67],
  [58, 64, 69],
  [57, 63, 67],
];

const ride = (chance: Chance, seconds: number): Mono =>
  summed([
    ...[3100, 4720, 6340].map((pitch, index) =>
      scaled(
        contoured(tone("Sine", steady(pitch), seconds), struck(0.001, seconds)),
        0.2 - index * 0.04
      )
    ),
    scaled(
      contoured(
        air(chance, "High", steady(7000), seconds),
        struck(0.001, seconds * 0.7)
      ),
      0.5
    ),
  ]);

const brush = (chance: Chance, seconds: number): Mono =>
  contoured(
    air(chance, "Band", ramp(2200, 3600, seconds), seconds, 0.8),
    (time) => Math.sin((Math.PI * time) / seconds) ** 2
  );

const brushTap = (chance: Chance): Mono =>
  contoured(air(chance, "Band", steady(3400), 0.07, 0.9), struck(0.002, 0.07));

const rimshot = (chance: Chance): Mono =>
  summed([
    contoured(tone("Sine", steady(480), 0.06), struck(0.0005, 0.05)),
    scaled(
      contoured(tone("Sine", steady(1730), 0.04), struck(0.0005, 0.035)),
      0.6
    ),
    scaled(tick(chance, 3200, 0.03, 1.2), 0.9),
  ]);

const chord = (
  desk: Desk,
  midis: readonly number[],
  place: Place,
  seconds: number
) => {
  for (const [index, midi] of midis.entries()) {
    put(
      desk,
      place.gain > 0.3 ? "Fx" : "Bed",
      keys(midi, seconds, desk.chance),
      {
        ...place,
        pan: (place.pan ?? 0) + (index - 1) * 0.12,
      }
    );
  }
};

const roomBed = ({ desk, times }: Arrangement) => {
  const grid = gridOf(0, times.build, ROOM_BEAT);

  const climb =
    times.pause === null ? grid.beats.length : grid.beats.length - 4;

  for (const [index, at] of grid.beats.entries()) {
    const level = tensionAt(times, at);
    const off = at + grid.beat * SWING;

    put(
      desk,
      "Bed",
      upright(
        index < climb
          ? (WALK[index % WALK.length] ?? 41)
          : 44 + (index - climb),
        grid.beat * 1.05,
        desk.chance
      ),
      { at, gain: 0.62, pan: -0.1, wet: 0.12 }
    );
    put(desk, "Bed", brush(desk.chance, grid.beat), {
      at,
      gain: 0.07 + 0.05 * level,
      pan: 0.25,
      wet: 0.2,
    });
    put(desk, "Bed", ride(desk.chance, 0.22), {
      at,
      gain: 0.1 + 0.06 * level,
      pan: 0.4,
      wet: 0.25,
    });

    if (index % 2 === 1) {
      put(desk, "Bed", brushTap(desk.chance), {
        at,
        gain: 0.2 + 0.1 * level,
        pan: 0.2,
        wet: 0.25,
      });
      put(desk, "Bed", ride(desk.chance, 0.16), {
        at: off,
        gain: 0.07 + 0.05 * level,
        pan: 0.4,
        wet: 0.25,
      });
    }

    if (level > 0.5 && index % 2 === 1 && index < climb) {
      chord(
        desk,
        COMP[Math.floor(index / 4) % COMP.length] ?? [57, 63, 67],
        { at: off, gain: 0.1 + 0.08 * level, pan: -0.3, wet: 0.35 },
        0.5
      );
    }

    if (index >= climb) {
      for (const step of [0, 1, 2]) {
        put(desk, "Bed", brushTap(desk.chance), {
          at: at + (step * grid.beat) / 3,
          gain: 0.1 + 0.05 * (index - climb) + 0.02 * step,
          pan: 0.2,
          wet: 0.25,
        });
      }
    }
  }
};

const snap = (chance: Chance): Mono =>
  spliced(
    [0, 0.012].map((at) => ({
      at,
      sound: contoured(
        air(chance, "Band", steady(2100), 0.04, 2.5),
        struck(0.0005, 0.04)
      ),
    }))
  );

const roomPause = ({ desk }: Arrangement, from: number, to: number) => {
  for (let at = from + ROOM_BEAT; at < to - 0.3; at += ROOM_BEAT * 2) {
    put(desk, "Fx", snap(desk.chance), { at, gain: 0.09, pan: 0.2, wet: 0.6 });
  }
};

const roomHit = ({ desk }: Arrangement, at: number) => {
  put(desk, "Fx", rimshot(desk.chance), { at, gain: 1, pan: 0.1, wet: 0.35 });
  put(
    desk,
    "Fx",
    summed([thump(125, 52, 0.3), scaled(thump(250, 130, 0.07), 0.5)]),
    {
      at,
      gain: 0.9,
      wet: 0.15,
    }
  );
  put(desk, "Fx", upright(29, 1.4, desk.chance), { at, gain: 0.7, wet: 0.2 });
  put(
    desk,
    "Fx",
    contoured(
      air(desk.chance, "High", steady(5200), 0.4),
      held(0.001, 0.2, 0.08)
    ),
    { at, gain: 0.3, pan: 0.4, wet: 0.4 }
  );
  chord(desk, [41, 53, 57, 63], { at, gain: 0.32, wet: 0.4 }, 1.4);
};

const roomAftermath = ({ desk, times }: Arrangement) => {
  if (times.hit === null || times.result - times.hit < ROOM_BEAT * 2) {
    return;
  }

  const grid = gridOf(times.hit + ROOM_BEAT, times.result, ROOM_BEAT);

  for (const [index, at] of grid.beats.entries()) {
    put(
      desk,
      "Bed",
      upright(WALK[(index * 2) % 8] ?? 41, grid.beat, desk.chance),
      {
        at,
        gain: 0.5,
        pan: -0.1,
        wet: 0.12,
      }
    );
    put(desk, "Bed", brush(desk.chance, grid.beat), {
      at,
      gain: 0.08,
      pan: 0.25,
    });

    if (index % 2 === 1) {
      put(desk, "Bed", brushTap(desk.chance), {
        at,
        gain: 0.2,
        pan: 0.2,
        wet: 0.25,
      });
    }
  }
};

const wah = (midi: number, seconds: number, fall: number): Mono =>
  contoured(
    filtered(
      tone(
        "Saw",
        (time) =>
          hertz(midi) *
          2 **
            ((-fall * Math.max(0, time - seconds * 0.5)) /
              (seconds * 0.5) /
              12) *
          (1 + 0.01 * Math.sin(time * 34)),
        seconds
      ),
      "Band",
      (time) => 650 + 1100 * Math.sin((Math.PI * time) / seconds) ** 2,
      3
    ),
    held(0.03, seconds - 0.15, 0.12)
  );

const roomSting = ({ desk, sheet, times }: Arrangement) => {
  const at = times.result;

  if (sheet.outcome === "Loss") {
    put(desk, "Fx", rimshot(desk.chance), {
      at,
      gain: 0.6,
      pan: 0.1,
      wet: 0.35,
    });
    put(desk, "Fx", wah(68, 0.34, 0), {
      at: at + 0.1,
      gain: 0.6,
      pan: -0.2,
      wet: 0.4,
    });
    put(desk, "Fx", wah(65, 0.9, 3), {
      at: at + 0.46,
      gain: 0.6,
      pan: -0.2,
      wet: 0.4,
    });
    put(
      desk,
      "Fx",
      contoured(
        summed([
          tone("Sine", glide(hertz(53), hertz(41), 0.7), 1),
          scaled(tone("Triangle", glide(hertz(65), hertz(53), 0.7), 1), 0.4),
        ]),
        struck(0.005, 1)
      ),
      { at: at + 0.46, gain: 0.6, wet: 0.1 }
    );

    return;
  }

  if (sheet.outcome === "Split") {
    chord(desk, [46, 58, 62, 67], { at, gain: 0.34, wet: 0.4 }, 0.9);
    chord(
      desk,
      [41, 57, 62, 65],
      { at: at + ROOM_BEAT, gain: 0.34, wet: 0.4 },
      1.4
    );
    put(desk, "Fx", ride(desk.chance, 0.5), {
      at: at + ROOM_BEAT,
      gain: 0.2,
      pan: 0.4,
      wet: 0.3,
    });

    return;
  }

  for (const [index, midi] of [48, 52, 53].entries()) {
    put(desk, "Fx", upright(midi, 0.4, desk.chance), {
      at: at + (index * ROOM_BEAT) / 3,
      gain: 0.6,
      wet: 0.12,
    });
  }

  const land = at + ROOM_BEAT;

  chord(desk, [41, 57, 62, 67, 72], { at: land, gain: 0.36, wet: 0.45 }, 1.5);
  put(desk, "Fx", ride(desk.chance, 0.7), {
    at: land,
    gain: 0.3,
    pan: 0.4,
    wet: 0.3,
  });
  put(desk, "Fx", rimshot(desk.chance), {
    at: land,
    gain: 0.5,
    pan: 0.1,
    wet: 0.35,
  });
  put(desk, "Fx", rimshot(desk.chance), {
    at: land + ROOM_BEAT * SWING,
    gain: 0.4,
    pan: 0.1,
    wet: 0.35,
  });
};

const roomTag = ({ desk, times }: Arrangement) => {
  put(desk, "Fx", upright(48, 0.4, desk.chance), {
    at: times.tag,
    gain: 0.6,
    wet: 0.12,
  });
  put(desk, "Fx", upright(41, 1, desk.chance), {
    at: times.tag + ROOM_BEAT * SWING,
    gain: 0.65,
    wet: 0.12,
  });
  put(desk, "Fx", rimshot(desk.chance), {
    at: times.tag + ROOM_BEAT * SWING,
    gain: 0.35,
    pan: 0.1,
    wet: 0.35,
  });
  put(desk, "Fx", ride(desk.chance, 0.8), {
    at: times.tag + ROOM_BEAT * SWING,
    gain: 0.22,
    pan: 0.4,
    wet: 0.3,
  });
};

const BACK_ROOM: Palette = {
  aftermath: roomAftermath,
  bed: roomBed,
  hit: roomHit,
  pause: roomPause,
  room: { damp: 0.6, size: 0.62 },
  small: { card: 2200, chipHigh: 3600, chipLow: 1900, knock: 230 },
  smallWet: 0.35,
  sting: roomSting,
  tag: roomTag,
  wet: 0.7,
};

const LOOKS: Readonly<Record<PaletteName, Palette>> = {
  BackRoom: BACK_ROOM,
  Broadcast: BROADCAST,
  Paper: PAPER,
};

const smallSound = (desk: Desk, palette: Palette, cue: SmallCue) => {
  const at = cue.atMs / 1000;
  const wet = palette.smallWet;
  const { pan } = cue;

  if (cue.kind === "Card") {
    put(desk, "Fx", cardSnap(desk.chance, palette.small), {
      at,
      gain: 0.5,
      pan,
      wet,
    });
  } else if (cue.kind === "Chips") {
    put(desk, "Fx", chipRun(desk.chance, palette.small, 6), {
      at,
      gain: 0.3,
      pan,
      wet,
    });
  } else if (cue.kind === "AllIn") {
    put(desk, "Fx", chipRun(desk.chance, palette.small, 14), {
      at,
      gain: 0.34,
      pan,
      wet,
    });
    put(desk, "Fx", thump(140, 60, 0.2), { at, gain: 0.4, pan, wet });
  } else if (cue.kind === "Check") {
    put(desk, "Fx", knock(desk.chance, palette.small), {
      at,
      gain: 0.4,
      pan,
      wet,
    });
  } else if (cue.kind === "Fold") {
    put(desk, "Fx", swish(desk.chance), { at, gain: 0.3, pan, wet });
  } else if (cue.kind === "Bar") {
    put(desk, "Fx", blip(660, 990), { at, gain: 0.12, pan, wet });
  } else {
    put(desk, "Fx", stamp(desk.chance), { at, gain: 0.4, pan, wet });
  }
};

const DUCK_DEPTH = 0.3;

const DUCK_HOLD = 0.35;

const DUCK_BACK = 0.7;

const FADE = 0.03;

const bedLevel = (times: Times) => (at: number) => {
  if (times.pause !== null && at >= times.pause - FADE) {
    const silentUntil = times.hit ?? times.result;

    if (at < times.pause) {
      return (times.pause - at) / FADE;
    }

    if (at < silentUntil) {
      return 0;
    }
  }

  const since = at - times.result;

  if (since >= -FADE) {
    return since < 0 ? -since / FADE : 0;
  }

  if (times.hit !== null && at >= times.hit) {
    const after = at - times.hit;

    return after < DUCK_HOLD
      ? DUCK_DEPTH
      : Math.min(
          1,
          DUCK_DEPTH + ((1 - DUCK_DEPTH) * (after - DUCK_HOLD)) / DUCK_BACK
        );
  }

  return 1;
};

const TAIL = 0.4;

export const soundtrackOf = (sheet: ScoreSheet, name: PaletteName): Stereo => {
  const palette = LOOKS[name];
  const times = timesOf(sheet);
  const seconds = times.length;

  const desk: Desk = {
    bed: stereoOf(seconds),
    chance: chanceFrom(sheet.seed + 17),
    fx: stereoOf(seconds),
    send: stereoOf(seconds),
  };

  const arrangement = { desk, sheet, times };

  palette.bed(arrangement);
  palette.aftermath(arrangement);
  ridden(desk.bed, bedLevel(times));

  if (times.pause !== null && times.hit !== null) {
    palette.pause(arrangement, times.pause, times.hit);
    palette.hit(arrangement, times.hit);
  }

  palette.sting(arrangement);
  palette.tag(arrangement);

  for (const cue of sheet.cues) {
    smallSound(desk, palette, cue);
  }

  const mix = desk.fx;

  added(mix, desk.bed, 1);
  added(mix, roomOf(desk.send, palette.room), palette.wet);
  ridden(mix, (at) => Math.min(1, Math.max(0, (seconds - at) / TAIL)));

  return mastered(mix, { ceiling: PEAK_CEILING, loudness: LOUDNESS_TARGET });
};
