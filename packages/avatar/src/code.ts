import { Option, Schema, SchemaTransformation } from "effect";

import {
  AvatarSchema,
  BACKDROPS,
  BODIES,
  EXTRAS,
  EYES,
  EYEWEAR,
  HEADWEAR,
  MOUTHS,
  NECKWEAR,
  SPECIES,
  TATTOOS,
} from "./avatar.js";
import type { Avatar } from "./avatar.js";
import { randomAvatar, seedFrom } from "./random.js";

const CODE_PREFIX = "s1";

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

type Choices<T> = readonly [T, ...(readonly T[])];

const slot = <T extends string>(choices: Choices<T>) => ({
  decode: (digit: string): T => choices[DIGITS.indexOf(digit)] ?? choices[0],
  encode: (choice: T) => DIGITS.charAt(choices.indexOf(choice)),
  pattern: `[${DIGITS.slice(0, choices.length)}]`,
});

const SLOTS = [
  ["species", slot(SPECIES)],
  ["body", slot(BODIES)],
  ["eyes", slot(EYES)],
  ["mouth", slot(MOUTHS)],
  ["headwear", slot(HEADWEAR)],
  ["eyewear", slot(EYEWEAR)],
  ["neck", slot(NECKWEAR)],
  ["tattoo", slot(TATTOOS)],
  ["extra", slot(EXTRAS)],
  ["backdrop", slot(BACKDROPS)],
] as const;

const CODE_PATTERN = new RegExp(
  `^${CODE_PREFIX}${SLOTS.map(([, part]) => part.pattern).join("")}$`,
  "u"
);

const digitAt = (code: string, index: number) =>
  code.charAt(CODE_PREFIX.length + index);

export const codeFor = (avatar: Avatar) =>
  CODE_PREFIX +
  SLOTS[0][1].encode(avatar.species) +
  SLOTS[1][1].encode(avatar.body) +
  SLOTS[2][1].encode(avatar.eyes) +
  SLOTS[3][1].encode(avatar.mouth) +
  SLOTS[4][1].encode(avatar.headwear) +
  SLOTS[5][1].encode(avatar.eyewear) +
  SLOTS[6][1].encode(avatar.neck) +
  SLOTS[7][1].encode(avatar.tattoo) +
  SLOTS[8][1].encode(avatar.extra) +
  SLOTS[9][1].encode(avatar.backdrop);

const fromCode = (code: string): Avatar => ({
  backdrop: SLOTS[9][1].decode(digitAt(code, 9)),
  body: SLOTS[1][1].decode(digitAt(code, 1)),
  extra: SLOTS[8][1].decode(digitAt(code, 8)),
  eyes: SLOTS[2][1].decode(digitAt(code, 2)),
  eyewear: SLOTS[5][1].decode(digitAt(code, 5)),
  headwear: SLOTS[4][1].decode(digitAt(code, 4)),
  mouth: SLOTS[3][1].decode(digitAt(code, 3)),
  neck: SLOTS[6][1].decode(digitAt(code, 6)),
  species: SLOTS[0][1].decode(digitAt(code, 0)),
  tattoo: SLOTS[7][1].decode(digitAt(code, 7)),
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
    Option.getOrElse(() => randomAvatar(seedFrom(stored)))
  );
