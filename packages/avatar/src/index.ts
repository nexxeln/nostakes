export {
  AvatarSchema,
  BACKDROPS,
  BODIES,
  DEFAULT_AVATAR,
  EXPRESSIONS,
  ExpressionSchema,
  EXTRAS,
  EYES,
  EYEWEAR,
  HEADWEAR,
  MOUTHS,
  NECKWEAR,
  SPECIES,
  TATTOOS,
} from "./avatar.js";

export type {
  Avatar,
  Backdrop,
  Body,
  Expression,
  Extra,
  Eyes,
  Eyewear,
  Headwear,
  Mouth,
  Neckwear,
  Species,
  Tattoo,
} from "./avatar.js";

export { AvatarFromCode, avatarFor, codeFor, parseAvatar } from "./code.js";

export { render } from "./draw.js";

export type { RenderOptions } from "./draw.js";

export { randomAvatar, seedFrom } from "./random.js";
