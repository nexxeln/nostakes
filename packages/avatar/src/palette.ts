import type { Colour, Theme } from "./avatar.js";

export const INK = "#1f1c31";

export const BLUE = "#3c67e8";

export const GREEN = "#00a768";

export const PINK = "#f590b8";

export const RED = "#ef5326";

export const YELLOW = "#f4b93c";

export interface Ground {
  readonly stock: string;
  readonly gap: string;
  readonly shadow: string;
  readonly edge: string;
  readonly light: string;
}

export const GROUNDS: Readonly<Record<Theme, Ground>> = {
  Dark: {
    edge: "rgba(0,0,0,0.8)",
    gap: "#16141d",
    light: "rgba(255,255,255,0.14)",
    shadow: "rgba(0,0,0,0.62)",
    stock: "#fbf7ef",
  },
  Light: {
    edge: "rgba(40,24,70,0.52)",
    gap: "#f6f1e8",
    light: "rgba(255,255,255,0.7)",
    shadow: "rgba(40,24,70,0.32)",
    stock: "#fffdf8",
  },
};

export interface Pair {
  readonly body: string;
  readonly fin: string;
}

export const PAIRS: Readonly<Record<Colour, Pair>> = {
  BluePink: { body: BLUE, fin: PINK },
  BlueYellow: { body: BLUE, fin: YELLOW },
  GreenPink: { body: GREEN, fin: PINK },
  GreenYellow: { body: GREEN, fin: YELLOW },
  PinkYellow: { body: PINK, fin: YELLOW },
  RedPink: { body: RED, fin: PINK },
  RedYellow: { body: RED, fin: YELLOW },
  YellowRed: { body: YELLOW, fin: RED },
};
