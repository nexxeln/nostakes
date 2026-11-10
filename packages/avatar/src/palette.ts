import type { Accent, Backdrop, Fur } from "./avatar.js";

export interface Coat {
  readonly base: string;
  readonly shade: string;
  readonly light: string;
  readonly inner: string;
  readonly mask: string;
  readonly maskIsDark: boolean;
}

export interface Tint {
  readonly base: string;
  readonly deep: string;
}

const DARK_MASK = "#4a3d47";

export const INK = "#3b2a24";

export const PAPER = "#fffaf2";

export const NOSE_PINK = "#ee8fa0";

export const MOUTH_INSIDE = "#8e3646";

export const TONGUE = "#f590a6";

export const BLUSH = "#ff8aa0";

export const TEAR = "#8fd0f5";

export const GOLD = "#f7c948";

export const FRECKLE = "#b5734f";

export const COATS: Readonly<Record<Fur, Coat>> = {
  Charcoal: {
    base: "#69636f",
    inner: "#e9a7b6",
    light: "#cbc5d1",
    mask: "#efe9f1",
    maskIsDark: false,
    shade: "#4c4754",
  },
  Cloud: {
    base: "#f8f6fb",
    inner: "#f5b3c2",
    light: "#ffffff",
    mask: DARK_MASK,
    maskIsDark: true,
    shade: "#dcd6e6",
  },
  Cocoa: {
    base: "#a8775a",
    inner: "#e8a9a0",
    light: "#e8cfb9",
    mask: DARK_MASK,
    maskIsDark: true,
    shade: "#85583e",
  },
  Cream: {
    base: "#f7e6cb",
    inner: "#f5b5be",
    light: "#fff8ec",
    mask: DARK_MASK,
    maskIsDark: true,
    shade: "#e2c59c",
  },
  Ginger: {
    base: "#f39a5f",
    inner: "#f9c0b0",
    light: "#fee6d3",
    mask: DARK_MASK,
    maskIsDark: true,
    shade: "#d47336",
  },
  Honey: {
    base: "#f4c070",
    inner: "#f3a3a8",
    light: "#fde8c5",
    mask: DARK_MASK,
    maskIsDark: true,
    shade: "#d99a43",
  },
  Lemon: {
    base: "#f9e184",
    inner: "#f5b0a6",
    light: "#fef6d2",
    mask: DARK_MASK,
    maskIsDark: true,
    shade: "#e3bd4b",
  },
  Lilac: {
    base: "#cfbdf5",
    inner: "#f5b0c9",
    light: "#efe8fe",
    mask: DARK_MASK,
    maskIsDark: true,
    shade: "#a991df",
  },
  Mint: {
    base: "#b0e4c7",
    inner: "#f5b0be",
    light: "#e4f8ec",
    mask: DARK_MASK,
    maskIsDark: true,
    shade: "#7cc59f",
  },
  Pink: {
    base: "#f9c2d0",
    inner: "#f07f9d",
    light: "#ffe8ef",
    mask: DARK_MASK,
    maskIsDark: true,
    shade: "#e996ad",
  },
  Sage: {
    base: "#bcd394",
    inner: "#f2b0a6",
    light: "#ebf3dc",
    mask: DARK_MASK,
    maskIsDark: true,
    shade: "#93b366",
  },
  Sky: {
    base: "#a9d7f6",
    inner: "#f5b0c2",
    light: "#e2f2fd",
    mask: DARK_MASK,
    maskIsDark: true,
    shade: "#74b3e2",
  },
};

export const TINTS: Readonly<Record<Accent, Tint>> = {
  Bubblegum: { base: "#f47fb4", deep: "#cf5390" },
  Cherry: { base: "#e9505a", deep: "#bb3540" },
  Coral: { base: "#ff8f61", deep: "#d9673b" },
  Grape: { base: "#9573e0", deep: "#6f4fbd" },
  Ink: { base: "#4a4452", deep: "#2f2a36" },
  Leaf: { base: "#4fb062", deep: "#358646" },
  Ocean: { base: "#4594e3", deep: "#2b6fb8" },
  Sun: { base: "#f7c443", deep: "#d69e1d" },
};

export const BACKDROP_COLOURS: Readonly<Record<Backdrop, string>> = {
  Butter: "#ffedb5",
  Felt: "#2f6e52",
  Lilac: "#e3d9fb",
  Mint: "#caefd9",
  Navy: "#35416d",
  Peach: "#ffd9c4",
  Plum: "#683a60",
  Rose: "#fad3dd",
  Sage: "#dbe7c5",
  Sand: "#f0e3cd",
  Sky: "#cfe7fb",
  Teal: "#2f6d75",
};
