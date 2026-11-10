import { Option, Schema, SchemaTransformation } from "effect";

import {
  AvatarSchema,
  COLOURS,
  EXTRAS,
  EYES,
  EYEWEAR,
  HEADWEAR,
  MARKS,
  MOUTHS,
  NECKWEAR,
  RANKS,
  SPECIES,
  SUITS,
} from "./avatar.js";
import type { Avatar } from "./avatar.js";
import { fromSharksCode } from "./legacy.js";
import { randomAvatar, seedFrom } from "./random.js";

const CODE_PREFIX = "h1";

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

type Choices<T> = readonly [T, ...(readonly T[])];

const slot = <T extends string>(choices: Choices<T>) => ({
  decode: (digit: string): T => choices[DIGITS.indexOf(digit)] ?? choices[0],
  encode: (choice: T) => DIGITS.charAt(choices.indexOf(choice)),
  pattern: `[${DIGITS.slice(0, choices.length)}]`,
});

const SLOTS = {
  colour: slot(COLOURS),
  extra: slot(EXTRAS),
  eyes: slot(EYES),
  eyewear: slot(EYEWEAR),
  headwear: slot(HEADWEAR),
  mark: slot(MARKS),
  mouth: slot(MOUTHS),
  neck: slot(NECKWEAR),
  rank: slot(RANKS),
  species: slot(SPECIES),
  suit: slot(SUITS),
};

const ORDER = [
  "species",
  "colour",
  "suit",
  "rank",
  "eyes",
  "mouth",
  "headwear",
  "eyewear",
  "neck",
  "mark",
  "extra",
] as const;

const CODE_PATTERN = new RegExp(
  `^${CODE_PREFIX}${ORDER.map((part) => SLOTS[part].pattern).join("")}$`,
  "u"
);

const digitAt = (code: string, part: (typeof ORDER)[number]) =>
  code.charAt(CODE_PREFIX.length + ORDER.indexOf(part));

export const codeFor = (avatar: Avatar) =>
  CODE_PREFIX +
  SLOTS.species.encode(avatar.species) +
  SLOTS.colour.encode(avatar.colour) +
  SLOTS.suit.encode(avatar.suit) +
  SLOTS.rank.encode(avatar.rank) +
  SLOTS.eyes.encode(avatar.eyes) +
  SLOTS.mouth.encode(avatar.mouth) +
  SLOTS.headwear.encode(avatar.headwear) +
  SLOTS.eyewear.encode(avatar.eyewear) +
  SLOTS.neck.encode(avatar.neck) +
  SLOTS.mark.encode(avatar.mark) +
  SLOTS.extra.encode(avatar.extra);

const fromCode = (code: string): Avatar => ({
  colour: SLOTS.colour.decode(digitAt(code, "colour")),
  extra: SLOTS.extra.decode(digitAt(code, "extra")),
  eyes: SLOTS.eyes.decode(digitAt(code, "eyes")),
  eyewear: SLOTS.eyewear.decode(digitAt(code, "eyewear")),
  headwear: SLOTS.headwear.decode(digitAt(code, "headwear")),
  mark: SLOTS.mark.decode(digitAt(code, "mark")),
  mouth: SLOTS.mouth.decode(digitAt(code, "mouth")),
  neck: SLOTS.neck.decode(digitAt(code, "neck")),
  rank: SLOTS.rank.decode(digitAt(code, "rank")),
  species: SLOTS.species.decode(digitAt(code, "species")),
  suit: SLOTS.suit.decode(digitAt(code, "suit")),
});

export const AvatarFromCode = Schema.String.check(
  Schema.isPattern(CODE_PATTERN)
).pipe(
  Schema.decodeTo(
    AvatarSchema,
    SchemaTransformation.transform({ decode: fromCode, encode: codeFor })
  )
);

export const parseAvatar = Schema.decodeUnknownOption(AvatarFromCode);

export const avatarFor = (stored: string): Avatar =>
  parseAvatar(stored).pipe(
    Option.orElse(() => fromSharksCode(stored)),
    Option.getOrElse(() => randomAvatar(seedFrom(stored)))
  );
