import { Option, Schema, SchemaTransformation } from "effect";

import {
  ACCENTS,
  ACCESSORIES,
  AvatarSchema,
  BACKDROPS,
  CHEEKS,
  DEFAULT_AVATAR,
  EYES,
  FURS,
  MARKINGS,
  MOUTHS,
  SPECIES,
} from "./avatar.js";
import type { Avatar } from "./avatar.js";

const CODE_PREFIX = "c1";

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

type Choices<T> = readonly [T, ...(readonly T[])];

const slot = <T extends string>(choices: Choices<T>) => ({
  decode: (digit: string): T => choices[DIGITS.indexOf(digit)] ?? choices[0],
  encode: (choice: T) => DIGITS.charAt(choices.indexOf(choice)),
  pattern: `[${DIGITS.slice(0, choices.length)}]`,
});

const SLOTS = {
  accent: slot(ACCENTS),
  accessory: slot(ACCESSORIES),
  backdrop: slot(BACKDROPS),
  cheeks: slot(CHEEKS),
  eyes: slot(EYES),
  fur: slot(FURS),
  marking: slot(MARKINGS),
  mouth: slot(MOUTHS),
  species: slot(SPECIES),
};

const CODE_PATTERN = new RegExp(
  `^${CODE_PREFIX}${[
    SLOTS.species.pattern,
    SLOTS.fur.pattern,
    SLOTS.marking.pattern,
    SLOTS.eyes.pattern,
    SLOTS.mouth.pattern,
    SLOTS.cheeks.pattern,
    SLOTS.accessory.pattern,
    SLOTS.accent.pattern,
    SLOTS.backdrop.pattern,
  ].join("")}$`,
  "u"
);

export const codeFor = (avatar: Avatar) =>
  CODE_PREFIX +
  SLOTS.species.encode(avatar.species) +
  SLOTS.fur.encode(avatar.fur) +
  SLOTS.marking.encode(avatar.marking) +
  SLOTS.eyes.encode(avatar.eyes) +
  SLOTS.mouth.encode(avatar.mouth) +
  SLOTS.cheeks.encode(avatar.cheeks) +
  SLOTS.accessory.encode(avatar.accessory) +
  SLOTS.accent.encode(avatar.accent) +
  SLOTS.backdrop.encode(avatar.backdrop);

const fromCode = (code: string): Avatar => {
  const digit = (index: number) => code.charAt(CODE_PREFIX.length + index);

  return {
    accent: SLOTS.accent.decode(digit(7)),
    accessory: SLOTS.accessory.decode(digit(6)),
    backdrop: SLOTS.backdrop.decode(digit(8)),
    cheeks: SLOTS.cheeks.decode(digit(5)),
    eyes: SLOTS.eyes.decode(digit(3)),
    fur: SLOTS.fur.decode(digit(1)),
    marking: SLOTS.marking.decode(digit(2)),
    mouth: SLOTS.mouth.decode(digit(4)),
    species: SLOTS.species.decode(digit(0)),
  };
};

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
  parseAvatar(stored).pipe(Option.getOrElse(() => DEFAULT_AVATAR));
