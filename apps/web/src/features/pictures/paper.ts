import { avatarFor, render } from "@nostakes/avatar";
import type { Expression } from "@nostakes/avatar";

import { CARD_HEIGHT, cardFaceMarks, cardFaceOf } from "../card-art.js";
import type { SuitLetter } from "../card-art.js";
import type { Deck, Theme } from "../model.js";

export type KeptFrame = "Chat" | "Story";

export type PictureFrame = KeptFrame | "Table";

export const KEPT_FRAMES: readonly KeptFrame[] = ["Chat", "Story"];

export const FRAME_SIZES: Readonly<
  Record<PictureFrame, { readonly height: number; readonly width: number }>
> = {
  Chat: { height: 1350, width: 1080 },
  Story: { height: 1920, width: 1080 },
  Table: { height: 1350, width: 1080 },
};

export const fileNameOf = (title: string, frame: KeptFrame) =>
  `nostakes-${title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}${frame === "Story" ? "-story" : ""}.png`;

export interface PictureLook {
  readonly deck: Deck;
  readonly fonts: string;
  readonly frame: PictureFrame;
  readonly theme: Theme;
}

export const CARD_RATIO = CARD_HEIGHT / 100;

export interface Palette {
  readonly card: string;
  readonly cardBack: string;
  readonly cardBackLine: string;
  readonly dimCard: string;
  readonly cardInk: string;
  readonly cardMuted: string;
  readonly cardRed: string;
  readonly edge: string;
  readonly face: string;
  readonly felt: string;
  readonly ink: string;
  readonly muted: string;
  readonly page: string;
  readonly brandShadow: string;
  readonly shadow: string;
  readonly suits: Readonly<Record<SuitLetter, string>>;
}

export const RED = "#ef5326";

export const ON_RED = "#fffaf3";

export const paletteFor = (theme: Theme, deck: Deck): Palette => {
  const light = theme === "Light";
  const cardInk = "#1d1c24";
  const cardRed = "#dc3b2f";

  return {
    brandShadow: light ? "#f4b93c" : "#3c67e8",
    card: light ? "#ffffff" : "#f7f3ea",
    cardBack: light ? "#1f1c31" : "#2b2738",
    cardBackLine: "rgb(255 255 255 / 0.28)",
    cardInk,
    cardMuted: light ? "#716a79" : "#6c6575",
    cardRed,
    dimCard: light ? "#f7f3ec" : "#7a777a",
    edge: light ? "rgb(255 255 255 / 0.7)" : "rgb(255 255 255 / 0.14)",
    face: light ? "#fffdf8" : "#ece6da",
    felt: light ? "#efe8dc" : "#201d29",
    ink: light ? "#1f1c31" : "#f4efe6",
    muted: light ? "#716a79" : "#9c95a8",
    page: light ? "#f6f1e8" : "#16141d",
    shadow: light ? "rgb(40 24 70 / 0.32)" : "rgb(0 0 0 / 0.62)",
    suits:
      deck === "FourColour"
        ? { c: "#22955a", d: "#2f63d8", h: "#e0402f", s: cardInk }
        : { c: cardInk, d: cardRed, h: cardRed, s: cardInk },
  };
};

export const part = (role: string, index: number, inner: string) =>
  inner.length === 0
    ? ""
    : `<g class="part" data-part="${role}" data-index="${index}">${inner}</g>`;

export const escaped = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const number = (value: number) => Number(value.toFixed(2));

export const sheet = (
  palette: Palette,
  box: {
    readonly fill: string;
    readonly height: number;
    readonly lift: number;
    readonly radius: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  }
) => {
  const step = Math.max(1.4, box.lift);
  const { height, radius, width, x, y } = box;

  return [
    `<rect x="${number(x + step * 0.55)}" y="${number(y + step)}" width="${width}" height="${height}" rx="${radius}" fill="${palette.shadow}"/>`,
    `<rect x="${number(x - 0.6)}" y="${number(y - 0.8)}" width="${width}" height="${height}" rx="${radius}" fill="${palette.edge}"/>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${box.fill}"/>`,
  ].join("");
};

export const DIM_MARKS = 0.42;

export const cardArt = (
  palette: Palette,
  card: string,
  place: {
    readonly dim: boolean;
    readonly lift?: number;
    readonly turn: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  }
) => {
  const face = cardFaceOf(card);
  const { width, x, y } = place;
  const height = width * CARD_RATIO;
  const marks = face === undefined ? "" : cardFaceMarks(face);

  const colour =
    face === undefined ? palette.cardInk : palette.suits[face.suit];

  return [
    `<g transform="rotate(${place.turn} ${number(x + width / 2)} ${number(y + height / 2)})">`,
    sheet(palette, {
      fill: place.dim ? palette.dimCard : palette.card,
      height,
      lift: width * (place.lift ?? 0.035),
      radius: width * 0.11,
      width,
      x,
      y,
    }),
    `<svg x="${number(x)}" y="${number(y)}" width="${number(width)}" height="${number(height)}" viewBox="0 0 100 ${CARD_HEIGHT}" fill="${colour}"${place.dim ? ` opacity="${DIM_MARKS}"` : ""} font-family="DM Sans, Figtree, sans-serif" font-weight="800">${marks}</svg>`,
    "</g>",
  ].join("");
};

export const NAME_WIDTH = 0.6;

export const nameArt = (
  palette: Palette,
  face: PaperFace,
  place: {
    readonly size: number;
    readonly tagged: boolean;
    readonly x: number;
    readonly y: number;
  }
) => {
  const { size, x, y } = place;
  const font = number(Math.max(34, size * 0.12));
  const middle = number(x + size / 2);
  const baseline = number(y + size + size * 0.17);

  const text = (fill: string) =>
    `<text x="${middle}" y="${baseline}" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="700" font-size="${font}" fill="${fill}">${escaped(face.name)}</text>`;

  if (face.name.length === 0) {
    return "";
  }

  if (!place.tagged) {
    return text(palette.ink);
  }

  const width = face.name.length * font * NAME_WIDTH + font * 1.1;

  return [
    sheet(palette, {
      fill: RED,
      height: font * 1.5,
      lift: 3,
      radius: font * 0.36,
      width: number(width),
      x: number(x + size / 2 - width / 2),
      y: number(baseline - font * 1.08),
    }),
    text(ON_RED),
  ].join("");
};

export const faceArt = (
  palette: Palette,
  face: PaperFace,
  theme: Theme,
  place: {
    readonly size: number;
    readonly tagged: boolean;
    readonly x: number;
    readonly y: number;
  }
) => {
  const { size, x, y } = place;

  const art = render(avatarFor(face.avatar), {
    expression: face.expression,
    size: size * 0.84,
    theme,
  }).replace(
    /^<svg /u,
    `<svg x="${number(x + size * 0.08)}" y="${number(y + size * 0.1)}" `
  );

  return [
    sheet(palette, {
      fill: palette.face,
      height: size,
      lift: size * 0.02,
      radius: size * 0.13,
      width: size,
      x,
      y,
    }),
    art,
    nameArt(palette, face, place),
  ].join("");
};

export const titleSize = (title: string, room: number, largest: number) =>
  Math.min(largest, room / Math.max(1, title.length * 0.56));

export const SITE_NAME = "nostakes";

export const SITE_DOMAIN = ".club";

export const markArt = (
  palette: Palette,
  place: { readonly x: number; readonly y: number }
) => {
  const text = (dx: number, name: string, domain: string) =>
    `<text x="${place.x + dx}" y="${place.y + dx}" text-anchor="end" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="40" letter-spacing="-1.4" xml:space="preserve"><tspan fill="${name}">${SITE_NAME}</tspan><tspan fill="${domain}">${SITE_DOMAIN}</tspan></text>`;

  return [
    text(3, palette.brandShadow, "none"),
    text(0, palette.ink, palette.muted),
  ].join("");
};

export const fontsFor = (fonts: string) =>
  fonts.length > 0 ? `<style>${fonts}</style>` : "";

export interface PaperFace {
  readonly avatar: string;
  readonly expression: Expression;
  readonly name: string;
}

export const FELT_INSET = 48;

export const paperSvg = (
  palette: Palette,
  look: PictureLook,
  content: string,
  fill = false
) => {
  const { height, width } = FRAME_SIZES[look.frame];
  const top = fill ? 0 : (height - FRAME_SIZES.Chat.height) / 2;
  const felt = fill ? height : FRAME_SIZES.Chat.height;

  const body = [
    look.frame === "Table"
      ? ""
      : `<rect x="0" y="${-top}" width="${width}" height="${height}" fill="${palette.page}"/>`,
    part(
      "felt",
      0,
      sheet(palette, {
        fill: palette.felt,
        height: felt - FELT_INSET * 2,
        lift: 5,
        radius: 44,
        width: FRAME_SIZES.Chat.width - FELT_INSET * 2,
        x: FELT_INSET,
        y: FELT_INSET,
      })
    ),
    content,
  ].join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    fontsFor(look.fonts),
    `<g transform="translate(0 ${top})">${body}</g>`,
    "</svg>",
  ].join("");
};
