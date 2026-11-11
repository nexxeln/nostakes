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

export const PALETTES = ["Broadcast", "Paper", "BackRoom"] as const;

export type PaletteName = (typeof PALETTES)[number];

export const LOUDNESS_TARGET = -14;

export const PEAK_CEILING = -3;
