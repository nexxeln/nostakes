import type { Chance, Mono } from "./dsp.js";

export type Outcome = "Loss" | "Split" | "Win";

export type SmallSound =
  | "AllIn"
  | "Bar"
  | "Card"
  | "Check"
  | "Chips"
  | "Fold"
  | "Stamp";

export interface SmallCue {
  readonly atMs: number;
  readonly kind: SmallSound;
  readonly pan: number;
}

export interface ScoreSheet {
  readonly cues: readonly SmallCue[];
  readonly hitMs: number | null;
  readonly lengthMs: number;
  readonly outcome: Outcome;
  readonly pauseMs: number | null;
  readonly resultMs: number;
  readonly seed: number;
  readonly tagMs: number;
}

export interface ScoreTimes {
  readonly build: number;
  readonly hit: number | null;
  readonly length: number;
  readonly pause: number | null;
  readonly result: number;
  readonly tag: number;
}

export type Bus = "Bed" | "Hits";

export interface Laid {
  readonly at: number;
  readonly gain: number;
  readonly pan?: number;
  readonly wet?: number;
}

export interface Scoring {
  readonly chance: Chance;
  readonly lay: (bus: Bus, sound: Mono, place: Laid) => void;
  readonly sheet: ScoreSheet;
  readonly times: ScoreTimes;
}

export interface ScoreKit {
  readonly aftermath: (scoring: Scoring) => void;
  readonly bed: (scoring: Scoring) => void;
  readonly hit: (scoring: Scoring, at: number) => void;
  readonly lean: number;
  readonly pause: (scoring: Scoring, from: number, to: number) => void;
  readonly room: { readonly damp: number; readonly size: number };
  readonly small: (scoring: Scoring, cue: SmallCue) => void;
  readonly sting: (scoring: Scoring) => void;
  readonly tag: (scoring: Scoring) => void;
  readonly wet: number;
}

export const LOUDNESS_TARGET = -14;

export const PEAK_CEILING = -3;
