import type { Expression } from "@nostakes/avatar";

import type { Theme } from "../../model.js";
import {
  CARD_RATIO,
  ON_RED,
  RED,
  cardArt,
  escaped,
  faceArt,
  number,
  sheet,
} from "../../pictures/paper.js";
import type { Palette } from "../../pictures/paper.js";
import type { Box } from "../film.js";

export interface Paint {
  readonly cover: number;
  readonly luminance: number;
}

export interface Sprite {
  readonly art: string;
  readonly box: Box;
  readonly paint: Paint;
  readonly shows: readonly string[];
}

export type Tone = "Cream" | "Hot" | "Ink" | "Paper" | "Sun";

export type Ground = "Hot" | "Ink" | "Paper";

export const FRAME = { height: 1920, width: 1080 };

export const CENTRE = { x: FRAME.width / 2, y: FRAME.height / 2 };

export const fillOf = (palette: Palette, tone: Tone) =>
  ({
    Cream: ON_RED,
    Hot: RED,
    Ink: palette.ink,
    Paper: palette.page,
    Sun: palette.brandShadow,
  })[tone];

const linear = (channel: number) => {
  const share = channel / 255;

  return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
};

const channelsOf = (colour: string) =>
  [1, 3, 5].map((at) => Number.parseInt(colour.slice(at, at + 2), 16));

export const luminanceOf = (colour: string) => {
  const [red = 0, green = 0, blue = 0] = channelsOf(colour);

  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
};

export const redShareOf = (colour: string) => {
  const [red = 0, green = 0, blue = 0] = channelsOf(colour);

  return red / Math.max(1, red + green + blue);
};

const MARGIN = 12;

const around = (x: number, y: number, width: number, height: number): Box => ({
  height: Math.ceil(height + MARGIN * 2),
  width: Math.ceil(width + MARGIN * 2),
  x: Math.floor(x - MARGIN),
  y: Math.floor(y - MARGIN),
});

const NARROW = new Set("I1.,:'! ");

const WIDE = new Set("MW%");

const emsOf = (text: string) => {
  let total = 0;

  for (const glyph of text) {
    if (NARROW.has(glyph)) {
      total += 0.33;
    } else if (WIDE.has(glyph)) {
      total += 0.9;
    } else {
      total += /\d/u.test(glyph) ? 0.6 : 0.68;
    }
  }

  return Math.max(0.3, total);
};

export const typeSize = (text: string, room: number, largest: number) =>
  Math.floor(Math.min(largest, room / emsOf(text)));

const TYPE_COVER = 0.4;

export const typeSprite = (
  palette: Palette,
  text: string,
  look: { readonly size: number; readonly tone: Tone }
): Sprite => {
  const { size } = look;
  const width = Math.round(emsOf(text) * size);
  const fill = fillOf(palette, look.tone);

  return {
    art: `<text x="0" y="${number(size * 0.36)}" text-anchor="middle" textLength="${width}" lengthAdjust="spacingAndGlyphs" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="${size}" fill="${fill}">${escaped(text)}</text>`,
    box: around(-width / 2, -size * 0.5, width, size * 1.1),
    paint: { cover: TYPE_COVER, luminance: luminanceOf(fill) },
    shows: [],
  };
};

const SLIP_INK: Readonly<Record<Tone, Tone>> = {
  Cream: "Hot",
  Hot: "Cream",
  Ink: "Paper",
  Paper: "Ink",
  Sun: "Ink",
};

export const slipSprite = (
  palette: Palette,
  text: string,
  look: { readonly size: number; readonly tone: Tone }
): Sprite => {
  const { size } = look;
  const width = Math.round(emsOf(text) * size + size * 1.1);
  const height = Math.round(size * 1.7);
  const fill = fillOf(palette, look.tone);

  return {
    art: [
      sheet(palette, {
        fill,
        height,
        lift: size * 0.12,
        radius: Math.round(size * 0.44),
        width,
        x: -width / 2,
        y: -height / 2,
      }),
      `<text x="0" y="${number(size * 0.35)}" text-anchor="middle" textLength="${Math.round(emsOf(text) * size)}" lengthAdjust="spacingAndGlyphs" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="${size}" fill="${fillOf(palette, SLIP_INK[look.tone])}">${escaped(text)}</text>`,
    ].join(""),
    box: around(
      -width / 2,
      -height / 2,
      width + size * 0.1,
      height + size * 0.16
    ),
    paint: { cover: 0.9, luminance: luminanceOf(fill) },
    shows: [],
  };
};

export const FACE_SIZE = 600;

const FACE_LIGHT = 0.82;

export const faceSprite = (
  palette: Palette,
  theme: Theme,
  face: { readonly avatar: string; readonly expression: Expression }
): Sprite => ({
  art: faceArt(
    palette,
    { avatar: face.avatar, expression: face.expression, name: "" },
    theme,
    { size: FACE_SIZE, tagged: false, x: -FACE_SIZE / 2, y: -FACE_SIZE / 2 }
  ),
  box: around(-FACE_SIZE / 2, -FACE_SIZE / 2, FACE_SIZE + 6, FACE_SIZE + 14),
  paint: { cover: 0.92, luminance: FACE_LIGHT },
  shows: [],
});

export const CARD_WIDTH = 380;

export const HERO_WIDTH = 520;

export const cardHeight = (width: number) => width * CARD_RATIO;

const backArt = (palette: Palette, width: number) => {
  const height = cardHeight(width);
  const inset = width * 0.1;
  const x = -width / 2;
  const y = -height / 2;

  return [
    sheet(palette, {
      fill: palette.card,
      height,
      lift: width * 0.035,
      radius: width * 0.11,
      width,
      x,
      y,
    }),
    `<rect x="${number(x + inset)}" y="${number(y + inset)}" width="${number(width - inset * 2)}" height="${number(height - inset * 2)}" rx="${number(width * 0.06)}" fill="${palette.cardBack}"/>`,
    `<rect x="${number(x + inset * 2)}" y="${number(y + inset * 2)}" width="${number(width - inset * 4)}" height="${number(height - inset * 4)}" rx="${number(width * 0.04)}" fill="none" stroke="${palette.cardBackLine}" stroke-width="${number(width * 0.025)}"/>`,
  ].join("");
};

const CARD_LIGHT = 0.93;

const BACK_LIGHT = 0.3;

export const cardSprite = (
  palette: Palette,
  card: string,
  width: number
): Sprite => {
  const height = cardHeight(width);
  const spill = width * 0.06;
  const up = card.length > 0;

  return {
    art: up
      ? cardArt(palette, card, {
          dim: false,
          turn: 0,
          width,
          x: -width / 2,
          y: -height / 2,
        })
      : backArt(palette, width),
    box: around(
      -width / 2 - spill,
      -height / 2 - spill,
      width + spill * 2,
      height + spill * 2
    ),
    paint: { cover: 0.82, luminance: up ? CARD_LIGHT : BACK_LIGHT },
    shows: up ? [card] : [],
  };
};

export const blockSprite = (fill: string, width: number): Sprite => {
  const height = cardHeight(width);

  return {
    art: `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${Math.round(width * 0.11)}" fill="${fill}"/>`,
    box: around(-width / 2, -height / 2, width, height),
    paint: { cover: 0.94, luminance: luminanceOf(fill) },
    shows: [],
  };
};

const RAYS = 28;

const REACH = 520;

const CLEAR = 220;

export const BURST_SCALE = 2.3;

export const burstSprite = (fill: string): Sprite => {
  const rays = Array.from({ length: RAYS }, (_, index) => {
    const angle = (index / RAYS) * Math.PI * 2 + (index % 3) * 0.05;
    const half = 0.012 + (index % 4) * 0.006;
    const from = CLEAR + (index % 5) * 22;

    const point = (radius: number, turn: number) =>
      `${number(Math.cos(angle + turn) * radius)},${number(Math.sin(angle + turn) * radius)}`;

    return `<polygon points="${point(from, 0)} ${point(REACH, -half)} ${point(REACH, half)}" fill="${fill}"/>`;
  });

  return {
    art: rays.join(""),
    box: { height: REACH * 2, width: REACH * 2, x: -REACH, y: -REACH },
    paint: { cover: 0.08, luminance: luminanceOf(fill) },
    shows: [],
  };
};

const BAND = { height: 150, width: FRAME.width + 180 };

export const bandSprite = (fill: string): Sprite => ({
  art: `<polygon points="${-BAND.width / 2},${-BAND.height / 2 + 60} ${BAND.width / 2},${-BAND.height / 2 - 60} ${BAND.width / 2},${BAND.height / 2 - 60} ${-BAND.width / 2},${BAND.height / 2 + 60}" fill="${fill}"/>`,
  box: {
    height: BAND.height + 140,
    width: BAND.width,
    x: -BAND.width / 2,
    y: -BAND.height / 2 - 70,
  },
  paint: { cover: 0.5, luminance: luminanceOf(fill) },
  shows: [],
});

const HALF_CELL = 30;

export const GROUND_SCALE = (FRAME.height / (HALF_CELL * 2)) * 1.3;

export const groundSprite = (fill: string): Sprite => ({
  art: `<rect x="${-HALF_CELL - 20}" y="${-HALF_CELL - 20}" width="${HALF_CELL * 2 + 40}" height="${HALF_CELL * 2 + 40}" fill="${fill}"/>`,
  box: {
    height: HALF_CELL * 2,
    width: HALF_CELL * 2,
    x: -HALF_CELL,
    y: -HALF_CELL,
  },
  paint: { cover: 1, luminance: luminanceOf(fill) },
  shows: [],
});

const SLANT = 190;

export const halfSprite = (fill: string): Sprite => {
  const half = FRAME.width / 2 + 60;
  const depth = FRAME.height / 2 + 120;

  return {
    art: `<polygon points="${-half},${SLANT} ${half},${-SLANT} ${half},${depth} ${-half},${depth}" fill="${fill}"/>`,
    box: {
      height: depth + SLANT,
      width: half * 2,
      x: -half,
      y: -SLANT,
    },
    paint: { cover: 0.82, luminance: luminanceOf(fill) },
    shows: [],
  };
};

export const halved = (sprite: Sprite): Sprite => ({
  ...sprite,
  art: `<g transform="scale(0.5)">${sprite.art}</g>`,
  box: {
    height: Math.ceil(sprite.box.height / 2),
    width: Math.ceil(sprite.box.width / 2),
    x: Math.floor(sprite.box.x / 2),
    y: Math.floor(sprite.box.y / 2),
  },
});

const PICTURE_LIGHT = 0.8;

export const pictureSprite = (
  svg: string,
  shows: readonly string[]
): Sprite => ({
  art: svg,
  box: { height: FRAME.height, width: FRAME.width, x: 0, y: 0 },
  paint: { cover: 1, luminance: PICTURE_LIGHT },
  shows,
});
