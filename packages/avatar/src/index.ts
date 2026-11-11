export {
  AvatarSchema,
  CHOICES,
  choicesOf,
  COLOURS,
  DEFAULT_AVATAR,
  EXPRESSIONS,
  ExpressionSchema,
  EXTRAS,
  EYES,
  EYEWEAR,
  HEADWEAR,
  MARKS,
  MOUTHS,
  NECKWEAR,
  PARTS,
  PartSchema,
  PLACED_PARTS,
  PlacedPartSchema,
  PLACELESS_PARTS,
  RANKS,
  SPECIES,
  SUITS,
  THEMES,
} from "./avatar.js";

export type {
  Avatar,
  Colour,
  Expression,
  Extra,
  Eyes,
  Eyewear,
  Headwear,
  Mark,
  Mouth,
  Neckwear,
  Part,
  PlacedPart,
  Rank,
  Species,
  Suit,
  Theme,
} from "./avatar.js";

export { AvatarFromCode, avatarFor, codeFor, parseAvatar } from "./code.js";

export { render } from "./draw.js";

export { PAIRS } from "./palette.js";

export type { Pair } from "./palette.js";

export {
  boxOfPart,
  closeUpOf,
  coversOfPart,
  FACE_BOX,
  isPlaced,
  placeOfPart,
  reachOfPart,
  spotsOfPart,
} from "./parts.js";

export type { Box } from "./parts.js";

export type { RenderOptions } from "./draw.js";

export { randomAvatar, seedFrom } from "./random.js";
