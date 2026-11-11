import type { Expression } from "@nostakes/avatar";

export const SEATS = ["you", "bo", "mara", "jonas"] as const;

export type Seat = (typeof SEATS)[number];

export type Friend = Exclude<Seat, "you">;

export const STARTING_STACK = 1000;

export const SMALL_BLIND = 10;

export const BIG_BLIND = 20;

export const SMALL_BLIND_SEAT: Seat = "bo";

export const BIG_BLIND_SEAT: Seat = "mara";

export type Street = "Flop" | "Turn" | "River";

export type Move =
  | { readonly kind: "Bet"; readonly seat: Seat; readonly to: number }
  | { readonly kind: "Call"; readonly seat: Seat }
  | { readonly kind: "Check"; readonly seat: Seat }
  | { readonly kind: "Fold"; readonly seat: Seat }
  | { readonly kind: "Show"; readonly seat: Seat }
  | { readonly kind: "Showdown"; readonly winner: Seat }
  | { readonly kind: "Street"; readonly street: Street };

export const bet = (seat: Seat, to: number): Move => ({
  kind: "Bet",
  seat,
  to,
});

export const call = (seat: Seat): Move => ({ kind: "Call", seat });

export const check = (seat: Seat): Move => ({ kind: "Check", seat });

export const fold = (seat: Seat): Move => ({ kind: "Fold", seat });

export const show = (seat: Seat): Move => ({ kind: "Show", seat });

export const showdown = (winner: Seat): Move => ({ kind: "Showdown", winner });

export const street = (name: Street): Move => ({
  kind: "Street",
  street: name,
});

export type Gesture = "Drag" | "Flick" | "Next" | "Peek" | "Tap";

export interface Choice {
  readonly gesture: Gesture;
  readonly label: string;
  readonly moves: readonly Move[];
  readonly to: string;
}

export interface Talk {
  readonly who: Friend;
  readonly words: string;
}

export interface TabledHand {
  readonly five: readonly string[];
  readonly name: string;
  readonly seat: Seat;
}

export type Faces = Readonly<Partial<Record<Seat, Expression>>>;

export type BeatKind = "Intro" | "Outcome" | "Play" | "Recap";

export interface Beat {
  readonly choices: readonly Choice[];
  readonly cue: string;
  readonly faces: Faces;
  readonly hand: string;
  readonly id: string;
  readonly kind: BeatKind;
  readonly line: string;
  readonly lit: readonly string[];
  readonly moves: readonly Move[];
  readonly peeked: boolean;
  readonly tabled: readonly TabledHand[];
  readonly talk: readonly Talk[];
}

export type Hole = readonly [string, string];

export interface Hand {
  readonly board: readonly [string, string, string, string, string];
  readonly first: string;
  readonly hole: Readonly<Record<Seat, Hole>>;
  readonly id: string;
  readonly played: readonly Move[];
  readonly title: string;
}

export interface Lesson {
  readonly beats: ReadonlyMap<string, Beat>;
  readonly end: string;
  readonly hands: readonly Hand[];
  readonly start: string;
}

export const beatOf = (lesson: Lesson, id: string) => lesson.beats.get(id);

export const handOf = (lesson: Lesson, id: string) =>
  lesson.hands.find((hand) => hand.id === id);
