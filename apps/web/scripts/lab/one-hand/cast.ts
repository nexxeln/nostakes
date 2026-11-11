import type { Expression } from "@nostakes/avatar";

import type { LineName, Player } from "./cuts.js";

export const ROLES: Readonly<
  Record<
    Player,
    {
      readonly acts: readonly string[];
      readonly city: string;
      readonly clock: string;
      readonly expressions: readonly Expression[];
      readonly poke: Expression;
      readonly won: string;
    }
  >
> = {
  Dev: {
    acts: ["Fold"],
    city: "Lisbon",
    clock: "2:11 am",
    expressions: ["Resting", "Folded", "Happy"],
    poke: "Folded",
    won: "",
  },
  Jonas: {
    acts: ["Call 60", "Call 180", "Call 760"],
    city: "Berlin",
    clock: "3:06 am",
    expressions: ["Resting", "Thinking", "Happy", "Gutted"],
    poke: "Thinking",
    won: "",
  },
  Maya: {
    acts: ["Call 60", "Fold"],
    city: "San Francisco",
    clock: "6:04 pm",
    expressions: ["Resting", "LookingDown", "Folded", "Happy"],
    poke: "LookingDown",
    won: "",
  },
  Priya: {
    acts: ["Raise 60", "Bet 180", "All in 760"],
    city: "Bangalore",
    clock: "7:35 am",
    expressions: ["Resting", "Thinking", "Happy", "Gutted"],
    poke: "Happy",
    won: "+2,120",
  },
  Sam: {
    acts: ["Call 60", "Fold"],
    city: "Toronto",
    clock: "9:02 pm",
    expressions: ["Resting", "Thinking", "Folded", "Happy"],
    poke: "Happy",
    won: "",
  },
};

export const LINES: Readonly<
  Record<LineName, { readonly say: string; readonly who: Player }>
> = {
  Clip: { say: "keeping this", who: "Maya" },
  DevFive: { say: "5 min", who: "Dev" },
  DevHere: { say: "here we go", who: "Dev" },
  DevKing: { say: "i folded a king", who: "Dev" },
  DevNight: { say: "gn", who: "Dev" },
  JonasFine: { say: "fine. in.", who: "Jonas" },
  JonasLate: { say: "it's 3 am here", who: "Jonas" },
  JonasRematch: { say: "rematch. sunday.", who: "Jonas" },
  Link: { say: "", who: "Sam" },
  MayaIn: { say: "in", who: "Maya" },
  MayaNext: { say: "same time next week?", who: "Maya" },
  MayaNo: { say: "NO", who: "Maya" },
  MayaPriya: { say: "priya no", who: "Maya" },
  PriyaDealing: { say: "who's dealing", who: "Priya" },
  PriyaSleep: { say: "sleep well, jonas", who: "Priya" },
  SamHaha: { say: "lol", who: "Sam" },
  SamLocked: { say: "there's a seat open", who: "Sam" },
  SamRules: { say: "straddles on. run it twice.", who: "Sam" },
  SamTonight: { say: "poker tonight?", who: "Sam" },
  SamUnchanged: { say: "they haven't changed, maya", who: "Sam" },
};

export const SCRAPS = 14;

export const scrapId = (index: number) => `scrap-${index}`;

export const holeId = (player: Player, index: number) =>
  `h-${player.toLowerCase()}-${index}`;

export const actorId = (player: Player) => player.toLowerCase();

export const emptyId = (player: Player) => `empty-${player.toLowerCase()}`;

export const lineId = (name: LineName) => `say-${name.toLowerCase()}`;
