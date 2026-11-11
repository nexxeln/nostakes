import { Option, Schema } from "effect";

import {
  CLIP_STYLES,
  DEFAULT_STYLE,
} from "../../features/moments/clip-style.js";
import type { ClipStyle } from "../../features/moments/clip-style.js";

const STYLE_KEY = "nostakes.clip-style";

const decoded = Schema.decodeUnknownOption(Schema.Literals(CLIP_STYLES));

const kept = () => {
  try {
    return globalThis.localStorage.getItem(STYLE_KEY);
  } catch {
    return null;
  }
};

export const rememberedStyle = (): ClipStyle =>
  Option.getOrElse(decoded(kept()), () => DEFAULT_STYLE);

export const rememberStyle = (style: ClipStyle) => {
  try {
    globalThis.localStorage.setItem(STYLE_KEY, style);
  } catch {
    return false;
  }

  return true;
};
