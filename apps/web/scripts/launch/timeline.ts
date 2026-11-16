export const TEMPO = 116;

export const BEAT_MS = 60_000 / TEMPO;

export const FPS = 30;

export const LENGTH_BEATS = 88;

export const LENGTH_MS = LENGTH_BEATS * BEAT_MS;

export const FRAME_COUNT = Math.round((LENGTH_MS * FPS) / 1000);

export const DROP_BEAT = 52;

export const HIT_BEAT = 80;

export const OUTRO_BEAT = 77;

export const msOfBeat = (beat: number) => beat * BEAT_MS;

export const beatOfMs = (ms: number) => ms / BEAT_MS;

export type ShotName =
  | "Chat"
  | "Fill"
  | "Gestures"
  | "Rules"
  | "BadBeat"
  | "Settle"
  | "Little"
  | "Outro"
  | "End";

export interface Section {
  readonly name: ShotName;
  readonly from: number;
  readonly to: number;
}

export const SECTIONS: readonly Section[] = [
  { from: 0, name: "Chat", to: 6 },
  { from: 6, name: "Fill", to: 14 },
  { from: 14, name: "Gestures", to: 26 },
  { from: 26, name: "Rules", to: 34 },
  { from: 34, name: "BadBeat", to: 46 },
  { from: 46, name: "Settle", to: 52 },
  { from: DROP_BEAT, name: "Little", to: OUTRO_BEAT },
  { from: OUTRO_BEAT, name: "Outro", to: HIT_BEAT },
  { from: HIT_BEAT, name: "End", to: LENGTH_BEATS },
];

export type LittleScene =
  | "Bounty"
  | "BombPot"
  | "RunTwice"
  | "Straddle"
  | "ShowOne"
  | "Button"
  | "WaitBig"
  | "Peeking"
  | "Reaction"
  | "Sweep"
  | "Fairness"
  | "KeepSeat";

export interface Little {
  readonly scene: LittleScene;
  readonly caption: string;
  readonly beats: number;
}

export const LITTLE_THINGS: readonly Little[] = [
  { beats: 2, caption: "The 7-2 game.", scene: "Bounty" },
  { beats: 2, caption: "Bomb pots.", scene: "BombPot" },
  { beats: 2, caption: "Run it twice.", scene: "RunTwice" },
  { beats: 2, caption: "Straddles.", scene: "Straddle" },
  { beats: 2, caption: "Show one card.", scene: "ShowOne" },
  { beats: 2, caption: "The button moves.", scene: "Button" },
  { beats: 2, caption: "Wait for the big blind.", scene: "WaitBig" },
  { beats: 2, caption: "You can see who's peeking.", scene: "Peeking" },
  { beats: 2, caption: "Throw a reaction.", scene: "Reaction" },
  { beats: 2, caption: "Chips go in like a dealer does it.", scene: "Sweep" },
  { beats: 2, caption: "Every deck is checked.", scene: "Fairness" },
  { beats: 3, caption: "Close the tab. Keep your seat.", scene: "KeepSeat" },
];

export const littleStart = (index: number) =>
  LITTLE_THINGS.slice(0, index).reduce(
    (beat, little) => beat + little.beats,
    DROP_BEAT
  );

export const RULE_STAMPS = [
  { beat: 27, colour: "yellow", word: "7-2 bounty" },
  { beat: 28, colour: "blue", word: "Bomb pots" },
  { beat: 29, colour: "green", word: "Run it twice" },
  { beat: 30, colour: "pink", word: "Straddle" },
] as const;

export const CHIMES: readonly number[] = [
  0.5, 2.5, 6, 14, 26, 27, 28, 29, 30, 34, 40, 46, 76,
];

export const CAPTIONS = {
  BadBeat: "Bad beats become clips.",
  End: "Free. No sign-up. Send a link.",
  Fill: "Your friends moved. Poker night didn't.",
  Gestures: ["Hold.", "Drag.", "Flick."],
  Fairness: "Hand 14 checks out.",
  Outro: "The little things your group already plays.",
  Rules: "Your house rules.",
  Settle: "No money on the table. Just the count.",
} as const;
