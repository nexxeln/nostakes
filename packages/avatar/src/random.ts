import {
  ACCENTS,
  ACCESSORIES,
  BACKDROPS,
  CHEEKS,
  EYES,
  FURS,
  MARKINGS,
  MOUTHS,
  SPECIES,
} from "./avatar.js";
import type { Avatar } from "./avatar.js";

type Choices<T> = readonly [T, ...(readonly T[])];

const PARK_MILLER_MODULUS = 2_147_483_647;

const PARK_MILLER_MULTIPLIER = 48_271;

const TEXT_BASE = 131;

const WARM_UP_STEPS = 6;

const advance = (state: number) =>
  (state * PARK_MILLER_MULTIPLIER) % PARK_MILLER_MODULUS;

const advanceBy = (state: number, steps: number): number =>
  steps === 0 ? state : advanceBy(advance(state), steps - 1);

export const seedFrom = (text: string) =>
  Array.from({ length: text.length }, (_, index) =>
    text.codePointAt(index)
  ).reduce<number>(
    (hash, unit) => (hash * TEXT_BASE + (unit ?? 0)) % PARK_MILLER_MODULUS,
    7
  );

const pick = <T>(choices: Choices<T>, state: number): T =>
  choices[state % choices.length] ?? choices[0];

export const randomAvatar = (seed: number): Avatar => {
  const start = advanceBy(
    1 + (Math.abs(Math.trunc(seed)) % (PARK_MILLER_MODULUS - 1)),
    WARM_UP_STEPS
  );

  const roll = (field: number) => advanceBy(start, field + 1);

  return {
    accent: pick(ACCENTS, roll(0)),
    accessory: pick(ACCESSORIES, roll(1)),
    backdrop: pick(BACKDROPS, roll(2)),
    cheeks: pick(CHEEKS, roll(3)),
    eyes: pick(EYES, roll(4)),
    fur: pick(FURS, roll(5)),
    marking: pick(MARKINGS, roll(6)),
    mouth: pick(MOUTHS, roll(7)),
    species: pick(SPECIES, roll(8)),
  };
};
