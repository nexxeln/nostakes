import { BROADCAST } from "./broadcast.js";
import type { Stereo } from "./dsp.js";
import { scoreOf } from "./mix.js";
import type { ScoreKit, ScoreSheet } from "./sheet.js";

export const CLIP_SCORE: ScoreKit = BROADCAST;

export const soundtrackOf = (sheet: ScoreSheet): Stereo =>
  scoreOf(sheet, CLIP_SCORE);
