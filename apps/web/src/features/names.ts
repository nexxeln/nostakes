import { nameProblem } from "@nostakes/room";
import type { NameProblem } from "@nostakes/room";
import { Option } from "effect";

const PROBLEM_TEXT = {
  Empty: "Type your name first.",
  HiddenCharacter:
    "That name has a line break or a hidden character. Type it again.",
  MixedAlphabets:
    "Use one alphabet in a name. Latin, Greek, and Cyrillic letters do not mix.",
  NoLetter: "A name needs at least one letter.",
  NotNormalised: "Type that name again.",
  SpaceAtEnd: "A name cannot start or end with a space.",
  StackedMarks: "That name stacks too many accents on one letter.",
  StrayMark: "An accent in that name has no letter under it.",
  TooLong: "A name is at most 40 characters.",
} satisfies Record<NameProblem, string>;

export const nameProblemText = (problem: NameProblem) => PROBLEM_TEXT[problem];

export const enteredName = (typed: string) => typed.trim().normalize("NFC");

export const nameRefusal = (name: string): Option.Option<string> =>
  nameProblem(name).pipe(Option.map(nameProblemText));

const FIRST_STRONG_ISOLATE = "\u2068";

const POP_DIRECTIONAL_ISOLATE = "\u2069";

export const isolated = (name: string) =>
  `${FIRST_STRONG_ISOLATE}${name}${POP_DIRECTIONAL_ISOLATE}`;
