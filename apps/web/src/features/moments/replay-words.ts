import { isolated } from "../names.js";
import { fitted } from "../pictures/text-fit.js";
import { chipsText } from "./captions.js";

const NAME_ROOM_EMS = 7.6;

export const shortName = (name: string) => fitted(name, 1, NAME_ROOM_EMS).text;

const who = (name: string) => isolated(shortName(name));

const RUN_WORDS = ["", "once", "twice", "three times"];

export const REPLAY_WORDS = {
  allIn: (name: string, to: number) =>
    `${who(name)} is all in for ${chipsText(to)}`,
  allInStack: "All in",
  bet: (name: string, to: number) => `${who(name)} bets ${chipsText(to)}`,
  call: (name: string) => `${who(name)} calls`,
  callsAllIn: (name: string) => `${who(name)} calls all in`,
  odds: (percent: number) => `${percent}%`,
  pot: (amount: number) => `Pot ${chipsText(amount)}`,
  raise: (name: string, to: number) =>
    `${who(name)} raises to ${chipsText(to)}`,
  runs: (runs: number) => `Running it ${RUN_WORDS[runs] ?? `${runs} times`}`,
  split: (amount: number) => `They split ${chipsText(amount)}`,
  stack: (amount: number) => chipsText(amount),
  wins: (name: string, amount: number) =>
    `${who(name)} wins ${chipsText(amount)}`,
} as const;
