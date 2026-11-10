import type { Tier } from "@nostakes/room";

import type { Theme } from "../model.js";
import {
  CARD_RATIO,
  ON_RED,
  RED,
  cardArt,
  escaped,
  faceArt,
  markArt,
  number,
  paletteFor,
  paperSvg,
  part,
  sheet,
  titleSize,
} from "../pictures/paper.js";
import type { Palette, PictureLook } from "../pictures/paper.js";
import { chipsText } from "./captions.js";
import type { MomentPicture, PictureFace } from "./schema.js";

export type { MomentPicture, PictureFace } from "./schema.js";

export type { PictureLook } from "../pictures/paper.js";

const SCRAP_COLOURS = ["#ef5326", "#3c67e8", "#f4b93c", "#00a768", "#f590b8"];

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

export const pictureSvg = (picture: MomentPicture, look: PictureLook) => {
  const palette = paletteFor(look.theme, look.deck);
  const duel = picture.faces.length >= 2;

  return paperSvg(
    palette,
    look,
    [
      confetti(picture, 1080, 1350),
      part(
        "title",
        0,
        titleArt(palette, picture, { room: 900, x: 90, y: 262 })
      ),
      part("line", 0, lineArt(palette, picture.line, { x: 92, y: 342 })),
      duel
        ? duelBody(palette, picture, look.theme)
        : soloBody(palette, picture, look.theme),
      part("pot", 0, potArt(palette, picture.pot, { x: 90, y: 1190 })),
      picture.also.length > 0
        ? `<text class="part" data-part="also" data-index="0" x="${1080 - 92}" y="1226" text-anchor="end" font-family="Figtree, sans-serif" font-weight="700" font-size="34" fill="${palette.muted}">${escaped(picture.also)}</text>`
        : "",
      part("mark", 0, markArt(palette, { x: 1080 - 92, y: 1278 })),
    ].join("")
  );
};
