import {
  added,
  chanceFrom,
  laid,
  leaned,
  mastered,
  ridden,
  roomOf,
  stereoOf,
} from "./dsp.js";
import type { Stereo } from "./dsp.js";
import { LOUDNESS_TARGET, PEAK_CEILING } from "./sheet.js";
import type { ScoreKit, ScoreSheet, ScoreTimes, Scoring } from "./sheet.js";

export const timesOf = (sheet: ScoreSheet): ScoreTimes => ({
  build: (sheet.pauseMs ?? sheet.resultMs) / 1000,
  hit: sheet.hitMs === null ? null : sheet.hitMs / 1000,
  length: sheet.lengthMs / 1000,
  pause: sheet.pauseMs === null ? null : sheet.pauseMs / 1000,
  result: sheet.resultMs / 1000,
  tag: sheet.tagMs / 1000,
});

const QUIET_START = 0.3;

export const tensionAt = (times: ScoreTimes, at: number) => {
  const along = Math.min(1, Math.max(0, at / Math.max(0.5, times.build)));

  return QUIET_START + (1 - QUIET_START) * along * along * (3 - 2 * along);
};

export interface Grid {
  readonly beat: number;
  readonly beats: readonly number[];
}

export const gridOf = (from: number, to: number, beat: number): Grid => {
  const count = Math.max(1, Math.round((to - from) / beat));
  const fitted = (to - from) / count;

  return {
    beat: fitted,
    beats: Array.from({ length: count }, (_, index) => from + index * fitted),
  };
};

const DUCK_DEPTH = 0.3;

const DUCK_HOLD = 0.35;

const DUCK_BACK = 0.7;

const FADE = 0.03;

const bedLevel = (times: ScoreTimes) => (at: number) => {
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

const LEAN_BELOW = 170;

const TAG_ROOM = 0.3;

const SEED_OFFSET = 17;

export const scoreOf = (sheet: ScoreSheet, kit: ScoreKit): Stereo => {
  const times = timesOf(sheet);
  const seconds = times.length;
  const bed = stereoOf(seconds);
  const hits = stereoOf(seconds);
  const send = stereoOf(seconds);

  const scoring: Scoring = {
    chance: chanceFrom(sheet.seed + SEED_OFFSET),
    lay: (bus, sound, place) => {
      const pan = place.pan ?? 0;
      const wet = place.wet ?? 0;

      laid(bus === "Bed" ? bed : hits, sound, {
        at: place.at,
        gain: place.gain,
        pan,
      });

      if (wet > 0) {
        laid(send, sound, { at: place.at, gain: place.gain * wet, pan });
      }
    },
    sheet,
    times,
  };

  kit.bed(scoring);
  kit.aftermath(scoring);
  ridden(bed, bedLevel(times));

  if (times.pause !== null && times.hit !== null) {
    kit.pause(scoring, times.pause, times.hit);
    kit.hit(scoring, times.hit);
  }

  kit.sting(scoring);

  if (times.tag < seconds - TAG_ROOM) {
    kit.tag(scoring);
  }

  for (const cue of sheet.cues) {
    kit.small(scoring, cue);
  }

  added(hits, bed, 1);
  added(hits, roomOf(send, kit.room), kit.wet);
  leaned(hits, LEAN_BELOW, kit.lean);
  ridden(hits, (at) => Math.min(1, Math.max(0, (seconds - at) / TAIL)));

  return mastered(hits, { ceiling: PEAK_CEILING, loudness: LOUDNESS_TARGET });
};
