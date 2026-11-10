import { Option } from "effect";

import type {
  Avatar,
  Extra,
  Eyes,
  Eyewear,
  Headwear,
  Mark,
  Mouth,
  Neckwear,
  Species,
} from "./avatar.js";
import { randomAvatar, seedFrom } from "./random.js";

const SHARKS_CODE =
  /^s1(?<parts>[0-9][0-9ab][0-4][0-5][0-8][0-8][0-6][0-9][0-6][0-9])$/u;

const SHARKS_SPECIES: readonly Species[] = [
  "GreatWhite",
  "Hammerhead",
  "GreatWhite",
  "Goldfish",
  "Puffer",
  "Piranha",
  "Goldfish",
  "Angler",
  "Whale",
  "Octopus",
];

const SHARKS_EYES: readonly Eyes[] = [
  "Pips",
  "Sleepy",
  "Slits",
  "Pips",
  "Beads",
];

const SHARKS_MOUTHS: readonly Mouth[] = [
  "Smirk",
  "Grin",
  "Line",
  "Pucker",
  "Fangs",
  "GoldTooth",
];

const SHARKS_HEADWEAR: readonly Headwear[] = [
  "None",
  "Cowboy",
  "Fedora",
  "Visor",
  "Crown",
  "Bandana",
  "None",
  "Cap",
  "Cap",
];

const SHARKS_EYEWEAR: readonly Eyewear[] = [
  "None",
  "Shades",
  "Shades",
  "Shades",
  "Round",
  "Round",
  "Monocle",
  "Round",
  "Patch",
];

const SHARKS_NECKWEAR: readonly Neckwear[] = [
  "None",
  "Chain",
  "Chain",
  "Bolo",
  "BowTie",
  "None",
  "Chain",
];

const SHARKS_TATTOOS: readonly Mark[] = [
  "None",
  "Pips",
  "Teardrop",
  "Pips",
  "Dice",
  "Chip",
  "None",
  "Index",
  "Index",
  "Scar",
];

const SHARKS_EXTRAS: readonly Extra[] = [
  "None",
  "Toothpick",
  "Toothpick",
  "None",
  "None",
  "None",
  "None",
];

const DIGITS = "0123456789ab";

const chosen = <T>(
  choices: readonly T[],
  parts: string,
  index: number,
  fallback: T
): T => choices[DIGITS.indexOf(parts.charAt(index))] ?? fallback;

export const fromSharksCode = (stored: string): Option.Option<Avatar> =>
  Option.fromNullishOr(SHARKS_CODE.exec(stored)?.groups?.parts).pipe(
    Option.map((parts): Avatar => {
      const base = randomAvatar(seedFrom(stored));

      return {
        ...base,
        extra: chosen(SHARKS_EXTRAS, parts, 8, base.extra),
        eyes: chosen(SHARKS_EYES, parts, 2, base.eyes),
        eyewear: chosen(SHARKS_EYEWEAR, parts, 5, base.eyewear),
        headwear: chosen(SHARKS_HEADWEAR, parts, 4, base.headwear),
        mark: chosen(SHARKS_TATTOOS, parts, 7, base.mark),
        mouth: chosen(SHARKS_MOUTHS, parts, 3, base.mouth),
        neck: chosen(SHARKS_NECKWEAR, parts, 6, base.neck),
        species: chosen(SHARKS_SPECIES, parts, 0, base.species),
      };
    })
  );
