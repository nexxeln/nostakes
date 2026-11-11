import type { ClipStyle } from "../clip-style.js";
import { BROADCAST } from "./broadcast.js";
import { DRIFT } from "./drift.js";
import type { Stereo } from "./dsp.js";
import { scoreOf } from "./mix.js";
import type { ScoreKit, ScoreSheet } from "./sheet.js";

export const CLIP_SCORES: Readonly<Record<ClipStyle, ScoreKit>> = {
  Broadcast: BROADCAST,
  Drift: DRIFT,
};

export const soundtrackOf = (
  sheet: ScoreSheet,
  style: ClipStyle = "Broadcast"
): Stereo => scoreOf(sheet, CLIP_SCORES[style]);
