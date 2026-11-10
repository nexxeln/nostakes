import { avatarFor, render } from "@nostakes/avatar";
import type { Tier } from "@nostakes/room";

import {
  CARD_HEIGHT,
  cardFaceMarks,
  isSuitLetter,
  rankLabel,
} from "../card-art.js";
import type { SuitLetter } from "../card-art.js";
import type { Deck, Theme } from "../model.js";
import { chipsText } from "./captions.js";
import type { MomentPicture, PictureFace } from "./schema.js";

export type { MomentPicture, PictureFace } from "./schema.js";

export type PictureFrame = "Chat" | "Story" | "Table";

export interface PictureLook {
  readonly deck: Deck;
  readonly fonts: string;
  readonly frame: PictureFrame;
  readonly theme: Theme;
}

export const FRAME_SIZES: Readonly<
  Record<PictureFrame, { readonly height: number; readonly width: number }>
> = {
  Chat: { height: 1350, width: 1080 },
  Story: { height: 1920, width: 1080 },
  Table: { height: 1350, width: 1080 },
};

const CARD_RATIO = CARD_HEIGHT / 100;

interface Palette {
  readonly card: string;
  readonly dimCard: string;
  readonly cardInk: string;
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

const RED = "#ef5326";

const ON_RED = "#fffaf3";

const SCRAP_COLOURS = ["#ef5326", "#3c67e8", "#f4b93c", "#00a768", "#f590b8"];

const paletteFor = (theme: Theme, deck: Deck): Palette => {
  const light = theme === "Light";
  const cardInk = "#1d1c24";
  const cardRed = "#dc3b2f";

  return {
    brandShadow: light ? "#f4b93c" : "#3c67e8",
    card: light ? "#ffffff" : "#f7f3ea",
    cardInk,
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

const part = (role: string, index: number, inner: string) =>
  inner.length === 0
    ? ""
    : `<g class="part" data-part="${role}" data-index="${index}">${inner}</g>`;

const escaped = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const number = (value: number) => Number(value.toFixed(2));

const sheet = (
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

const DIM_MARKS = 0.42;

const cardArt = (
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
  const rank = rankLabel(card.charAt(0));
  const suit = card.charAt(1);
  const { width, x, y } = place;
  const height = width * CARD_RATIO;
  const marks = isSuitLetter(suit) ? cardFaceMarks(rank, suit) : "";
  const colour = isSuitLetter(suit) ? palette.suits[suit] : palette.cardInk;

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

const NAME_WIDTH = 0.6;

const nameArt = (
  palette: Palette,
  face: PictureFace,
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

const faceArt = (
  palette: Palette,
  face: PictureFace,
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

const titleSize = (title: string, room: number, largest: number) =>
  Math.min(largest, room / Math.max(1, title.length * 0.56));

const titleArt = (
  palette: Palette,
  picture: MomentPicture,
  place: { readonly room: number; readonly x: number; readonly y: number }
) => {
  const size = number(titleSize(picture.title, place.room, 156));

  const text = (fill: string, dx: number, dy: number) =>
    `<text x="${place.x + dx}" y="${place.y + dy}" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="${size}" letter-spacing="${number(-size * 0.035)}" fill="${fill}">${escaped(picture.title)}</text>`;

  const overprint = !picture.painful && picture.tier >= 2;

  return [
    overprint ? text(RED, size * 0.05, size * 0.035) : "",
    text(palette.ink, 0, 0),
  ].join("");
};

const SCRAP_SPOTS: readonly (readonly [number, number])[] = [
  [0.03, 0.08],
  [0.97, 0.06],
  [0.72, 0.1],
  [0.88, 0.2],
  [0.96, 0.33],
  [0.02, 0.4],
  [0.97, 0.5],
  [0.03, 0.62],
  [0.97, 0.66],
  [0.02, 0.86],
  [0.95, 0.83],
  [0.55, 0.97],
  [0.3, 0.98],
  [0.8, 0.96],
  [0.6, 0.04],
  [0.42, 0.02],
];

const scrap = (index: number, width: number, height: number, tier: Tier) => {
  const [spotX, spotY] = SCRAP_SPOTS[index % SCRAP_SPOTS.length] ?? [0, 0];

  const jitter = Math.floor(index / SCRAP_SPOTS.length);
  const x = spotX + (((index * 37) % 7) - 3) * 0.008 + jitter * 0.012;
  const y = spotY + (((index * 53) % 7) - 3) * 0.01 + jitter * 0.015;
  const turn = ((index * 53) % 90) - 45;
  const colour = SCRAP_COLOURS[index % SCRAP_COLOURS.length] ?? RED;
  const size = 18 + ((index * 17) % 22) * (tier === 3 ? 1.3 : 1);

  return `<rect x="${number(x * width)}" y="${number(y * height)}" width="${number(size)}" height="${number(size * 0.62)}" rx="${number(size * 0.12)}" fill="${colour}" transform="rotate(${turn} ${number(x * width)} ${number(y * height)})"/>`;
};

const confetti = (picture: MomentPicture, width: number, height: number) => {
  if (picture.painful || picture.tier < 2) {
    return "";
  }

  const count = picture.tier === 3 ? 40 : 16;

  return Array.from({ length: count }, (_, index) =>
    part("scrap", index, scrap(index, width, height, picture.tier))
  ).join("");
};

const potArt = (
  palette: Palette,
  pot: number,
  place: { readonly x: number; readonly y: number }
) => {
  const text = chipsText(pot);
  const width = 150 + text.length * 34;

  return [
    sheet(palette, {
      fill: RED,
      height: 96,
      lift: 3,
      radius: 16,
      width,
      x: place.x,
      y: place.y,
    }),
    `<text x="${place.x + 28}" y="${place.y + 58}" font-family="Figtree, sans-serif" font-weight="800" font-size="26" letter-spacing="2" fill="${ON_RED}">POT</text>`,
    `<text x="${place.x + 100}" y="${place.y + 68}" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="58" fill="${ON_RED}">${text}</text>`,
  ].join("");
};

const markArt = (
  palette: Palette,
  place: { readonly x: number; readonly y: number }
) =>
  [
    `<text x="${place.x + 3}" y="${place.y + 3}" text-anchor="end" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="40" letter-spacing="-1.4" fill="${palette.brandShadow}">nostakes</text>`,
    `<text x="${place.x}" y="${place.y}" text-anchor="end" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="40" letter-spacing="-1.4" fill="${palette.ink}">nostakes</text>`,
  ].join("");

const boardArt = (
  palette: Palette,
  picture: MomentPicture,
  place: { readonly width: number; readonly x: number; readonly y: number }
) => {
  const rows = picture.boards.filter((board) => board.length > 0);
  const gap = 14;
  const cardWidth = Math.min(140, (place.width - gap * 4) / 5);
  const rowHeight = cardWidth * CARD_RATIO + 22;
  const scale = rows.length > 1 ? 0.72 : 1;
  const width = cardWidth * scale;
  const span = width * 5 + gap * 4;
  const left = place.x + (place.width - span) / 2;
  const anyLifted = picture.lifted.length > 0;

  return rows
    .map((board, row) =>
      board
        .map((card, index) => {
          const lifted = picture.lifted.includes(card);

          return part(
            lifted ? "lifted" : "board",
            row * 5 + index,
            cardArt(palette, card, {
              dim: anyLifted && !lifted,
              turn: 0,
              width,
              x: left + index * (width + gap),
              y:
                place.y + row * rowHeight * scale - (lifted ? width * 0.16 : 0),
            })
          );
        })
        .join("")
    )
    .join("");
};

const holeArt = (
  palette: Palette,
  face: PictureFace,
  place: {
    readonly owner: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  }
) => {
  const rise = face.won ? place.width * 0.1 : 0;

  return face.cards
    .map((card, index) =>
      part(
        "hole",
        place.owner * 2 + index,
        cardArt(palette, card, {
          dim: false,
          lift: face.won ? 0.07 : 0.035,
          turn: index === 0 ? -7 : 6,
          width: place.width,
          x: place.x + index * place.width * 0.78,
          y: place.y + (index === 0 ? 6 : 0) - rise,
        })
      )
    )
    .join("");
};

const soloBody = (palette: Palette, picture: MomentPicture, theme: Theme) => {
  const [lead] = picture.faces;

  if (lead === undefined) {
    return "";
  }

  return [
    part(
      "face",
      0,
      faceArt(palette, lead, theme, {
        size: 360,
        tagged: false,
        x: 96,
        y: 440,
      })
    ),
    holeArt(palette, lead, {
      owner: 0,
      width: 180,
      x: 560,
      y: 470,
    }),
    boardArt(palette, picture, { width: 900, x: 90, y: 925 }),
  ].join("");
};

const duelBody = (palette: Palette, picture: MomentPicture, theme: Theme) => {
  const columns = [96, 560];
  const duel = picture.faces.slice(0, 2);
  const oneWinner = duel.filter((face) => face.won).length === 1;

  return [
    ...duel.map((face, index) => {
      const x = columns[index] ?? 90;

      return [
        part(
          "face",
          index,
          faceArt(palette, face, theme, {
            size: 240,
            tagged: oneWinner && face.won,
            x,
            y: 450,
          })
        ),
        holeArt(palette, face, {
          owner: index,
          width: 104,
          x: x + 262,
          y: 500,
        }),
      ].join("");
    }),
    boardArt(palette, picture, { width: 900, x: 90, y: 850 }),
  ].join("");
};

const LINE_CHARACTERS = 38;

const wrapped = (text: string, most: number): readonly string[] => {
  const lines: string[] = [];

  for (const word of text.split(" ")) {
    const last = lines.at(-1);

    if (last !== undefined && `${last} ${word}`.length <= most) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }

  return lines;
};

const lineArt = (
  palette: Palette,
  line: string,
  place: { readonly x: number; readonly y: number }
) => {
  const lines = wrapped(line, LINE_CHARACTERS);
  const size = lines.length > 2 ? 34 : 42;
  const shown = wrapped(line, lines.length > 2 ? 48 : LINE_CHARACTERS);

  return shown
    .slice(0, 2)
    .map(
      (text, index) =>
        `<text x="${place.x}" y="${place.y + index * size * 1.25}" font-family="Figtree, sans-serif" font-weight="600" font-size="${size}" fill="${palette.muted}">${escaped(text)}</text>`
    )
    .join("");
};

const fontsFor = (fonts: string) =>
  fonts.length > 0 ? `<style>${fonts}</style>` : "";

export const pictureSvg = (picture: MomentPicture, look: PictureLook) => {
  const palette = paletteFor(look.theme, look.deck);
  const { height, width } = FRAME_SIZES[look.frame];
  const top = (height - FRAME_SIZES.Chat.height) / 2;
  const duel = picture.faces.length >= 2;
  const table = look.frame === "Table";

  const body = [
    table
      ? ""
      : `<rect x="0" y="${-top}" width="${width}" height="${height}" fill="${palette.page}"/>`,
    part(
      "felt",
      0,
      sheet(palette, {
        fill: palette.felt,
        height: 1350 - 96,
        lift: 5,
        radius: 44,
        width: 1080 - 96,
        x: 48,
        y: 48,
      })
    ),
    confetti(picture, 1080, 1350),
    part("title", 0, titleArt(palette, picture, { room: 900, x: 90, y: 262 })),
    part("line", 0, lineArt(palette, picture.line, { x: 92, y: 342 })),
    duel
      ? duelBody(palette, picture, look.theme)
      : soloBody(palette, picture, look.theme),
    part("pot", 0, potArt(palette, picture.pot, { x: 90, y: 1190 })),
    picture.also.length > 0
      ? `<text class="part" data-part="also" data-index="0" x="${1080 - 92}" y="1226" text-anchor="end" font-family="Figtree, sans-serif" font-weight="700" font-size="34" fill="${palette.muted}">${escaped(picture.also)}</text>`
      : "",
    part("mark", 0, markArt(palette, { x: 1080 - 92, y: 1278 })),
  ].join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    fontsFor(look.fonts),
    `<g transform="translate(0 ${top})">${body}</g>`,
    "</svg>",
  ].join("");
};
