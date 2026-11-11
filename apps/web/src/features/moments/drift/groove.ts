import { CLIP_FPS } from "../clip-plan.js";

export const BEATS_IN_BAR = 4;

export const STEPS_IN_BEAT = 4;

export const STEPS_IN_BAR = BEATS_IN_BAR * STEPS_IN_BEAT;

export const FRAMES_IN_BEAT = 12;

export const KICK_STEPS: readonly number[] = [0, 6, 8, 14];

export const CLAP_STEPS: readonly number[] = [4, 12];

export const CARD_BEATS = 4;

export const POT_BEATS = 3;

export const REACTION_BEATS = 2;

export const BUILD_BEAT = 4;

export const ROLL_BEAT = 11;

export const WIND_UP_BEAT = 12;

export const GAP_BEAT = 15;

export const DROP_BEAT = 16;

export const BEAT_SECONDS = FRAMES_IN_BEAT / CLIP_FPS;

export const STEP_SECONDS = BEAT_SECONDS / STEPS_IN_BEAT;

export const frameOfBeat = (beat: number) => Math.round(beat * FRAMES_IN_BEAT);

export const msOfFrame = (frame: number) => (frame * 1000) / CLIP_FPS;

export const msOfBeat = (beat: number) => msOfFrame(frameOfBeat(beat));
