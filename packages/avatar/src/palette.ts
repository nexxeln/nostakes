import type { Backdrop, Body } from "./avatar.js";

export interface Skin {
  readonly base: string;
  readonly shade: string;
  readonly belly: string;
  readonly dark: boolean;
}

export const INK = "#1d1a2e";

export const PAPER = "#fffdf6";

export const SNOW = "#f3f1ff";

export const GOLD = "#ffc93c";

export const GOLD_DEEP = "#d48f17";

export const GOLD_LIGHT = "#fff1b3";

export const CARD_RED = "#d8344a";

export const CHIP_BLUE = "#3a6ff0";

export const MOUTH_INSIDE = "#6e2338";

export const TONGUE = "#ff8fa6";

export const BLUSH = "#ff7d9b";

export const TEAR = "#8fd8ff";

export const TATTOO_INK = "#2a3570";

export const TATTOO_LIGHT = "#e9edff";

export const TATTOO_RED = "#e2405a";

export const SKINS: Readonly<Record<Body, Skin>> = {
  Bubblegum: {
    base: "#ff9cc6",
    belly: "#ffe3ef",
    dark: false,
    shade: "#ea74a8",
  },
  Coral: { base: "#ff6f61", belly: "#ffd6cf", dark: false, shade: "#e04c42" },
  Grape: { base: "#a585f0", belly: "#ece4ff", dark: false, shade: "#8263d4" },
  Lagoon: { base: "#3fc6ad", belly: "#d6f6ee", dark: false, shade: "#24a28b" },
  Lemon: { base: "#ffd84a", belly: "#fff5cc", dark: false, shade: "#e9b724" },
  Midnight: {
    base: "#36427a",
    belly: "#cdd6f5",
    dark: true,
    shade: "#27305c",
  },
  Orange: { base: "#ff9a36", belly: "#ffe2c0", dark: false, shade: "#e9761a" },
  Pearl: { base: "#eef0f7", belly: "#ffffff", dark: false, shade: "#cdd3e2" },
  Sand: { base: "#d8b37a", belly: "#fbf0dc", dark: false, shade: "#b78d52" },
  Sky: { base: "#6db5ff", belly: "#e0efff", dark: false, shade: "#4a91e8" },
  Slate: { base: "#617089", belly: "#e1e6ee", dark: true, shade: "#4a566c" },
  Steel: { base: "#93a6bd", belly: "#f3f6fa", dark: false, shade: "#71849d" },
};

export interface Water {
  readonly base: string;
  readonly glow: string;
  readonly dark: boolean;
}

export const WATERS: Readonly<Record<Backdrop, Water>> = {
  Coral: { base: "#ff9d86", dark: false, glow: "#ffd2c4" },
  Deep: { base: "#203a70", dark: true, glow: "#3d5d9c" },
  Felt: { base: "#2e8a5d", dark: true, glow: "#4fae7f" },
  Lagoon: { base: "#8ad7e6", dark: false, glow: "#c4f0f7" },
  Lilac: { base: "#c4b2f4", dark: false, glow: "#e6ddff" },
  Neon: { base: "#ff5fa0", dark: false, glow: "#ff9cc4" },
  Reef: { base: "#1f9e9a", dark: true, glow: "#4cc4bf" },
  Sand: { base: "#f0dcb2", dark: false, glow: "#fbf0d6" },
  Sunset: { base: "#ffc254", dark: false, glow: "#ffe39e" },
  Velvet: { base: "#a3304b", dark: true, glow: "#c95470" },
};
