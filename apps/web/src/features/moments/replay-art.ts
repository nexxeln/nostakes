import { Match } from "effect";

import type { Theme } from "../model.js";
import {
  CARD_RATIO,
  ON_RED,
  RED,
  cardArt,
  escaped,
  faceArt,
  number,
  sheet,
} from "../pictures/paper.js";
import type { Palette } from "../pictures/paper.js";
import { textWidth } from "../pictures/text-fit.js";
import type { Box } from "./clip-plan.js";
import type { SpriteArt } from "./replay-stage.js";

export interface SpriteMarkup {
  readonly box: Box;
  readonly markup: string;
}

const MARGIN = 10;

const boxAround = (
  x: number,
  y: number,
  width: number,
  height: number
): Box => ({
  height: Math.ceil(height + MARGIN * 2),
  width: Math.ceil(width + MARGIN * 2),
  x: Math.floor(x - MARGIN),
  y: Math.floor(y - MARGIN),
});

const labelOf = (
  palette: Palette,
  art: Extract<SpriteArt, { kind: "Label" }>
): SpriteMarkup => {
  const width = textWidth(art.text, art.size) + art.size;
  const heavy = art.weight === "Heavy";

  return {
    box: boxAround(art.x - width / 2, art.y - art.size, width, art.size * 1.4),
    markup: `<text x="${art.x}" y="${art.y}" text-anchor="middle" font-family="${heavy ? "DM Sans, " : ""}Figtree, sans-serif" font-weight="${heavy ? 800 : 700}" font-size="${art.size}"${heavy ? ` letter-spacing="${number(-art.size * 0.03)}"` : ""} fill="${art.tone === "Ink" ? palette.ink : palette.muted}">${escaped(art.text)}</text>`,
  };
};

const LINE_GAP = 1.14;

const captionOf = (
  palette: Palette,
  art: Extract<SpriteArt, { kind: "Caption" }>
): SpriteMarkup => {
  const width = Math.max(
    ...art.lines.map((line) => textWidth(line, art.size) + art.size)
  );

  const step = art.size * LINE_GAP;

  return {
    box: boxAround(
      art.x - width / 2,
      art.y - art.size,
      width,
      step * art.lines.length + art.size * 0.3
    ),
    markup: art.lines
      .map(
        (line, index) =>
          `<text x="${art.x}" y="${number(art.y + index * step)}" text-anchor="middle" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="${art.size}" letter-spacing="${number(-art.size * 0.035)}" fill="${palette.ink}">${escaped(line)}</text>`
      )
      .join(""),
  };
};

const BAR_RADIUS = 14;

const barOf = (
  palette: Palette,
  art: Extract<SpriteArt, { kind: "Bar" }>
): SpriteMarkup => {
  const fills = { Lead: RED, Other: palette.ink, Track: palette.face };

  return {
    box: boxAround(art.x, art.y, art.width + 4, art.height + 4),
    markup:
      art.tone === "Track"
        ? sheet(palette, {
            fill: fills.Track,
            height: art.height,
            lift: 3,
            radius: BAR_RADIUS,
            width: art.width,
            x: art.x,
            y: art.y,
          })
        : `<rect x="${art.x}" y="${art.y}" width="${art.width}" height="${art.height}" rx="${BAR_RADIUS}" fill="${fills[art.tone]}"/>`,
  };
};

const pillOf = (
  palette: Palette,
  art: Extract<SpriteArt, { kind: "Pill" }>
): SpriteMarkup => {
  const height = Math.round(art.size * 1.74);
  const width = textWidth(art.text, art.size) + art.size * 1.2;
  const x = art.x - width / 2;
  const y = art.y - height / 2;
  const red = art.tone === "Red";

  return {
    box: boxAround(x, y, width + 4, height + 4),
    markup: [
      sheet(palette, {
        fill: red ? RED : palette.face,
        height,
        lift: 3,
        radius: Math.round(art.size * 0.46),
        width: number(width),
        x: number(x),
        y: number(y),
      }),
      `<text x="${art.x}" y="${number(art.y + art.size * 0.36)}" text-anchor="middle" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="${art.size}" fill="${red ? ON_RED : palette.ink}">${escaped(art.text)}</text>`,
    ].join(""),
  };
};

const backOf = (
  palette: Palette,
  art: Extract<SpriteArt, { kind: "Card" }>
) => {
  const height = art.width * CARD_RATIO;
  const inset = art.width * 0.1;
  const centreX = number(art.x + art.width / 2);
  const centreY = number(art.y + height / 2);

  return [
    `<g transform="rotate(${art.turn} ${centreX} ${centreY})">`,
    sheet(palette, {
      fill: palette.card,
      height,
      lift: art.width * 0.035,
      radius: art.width * 0.11,
      width: art.width,
      x: art.x,
      y: art.y,
    }),
    `<rect x="${number(art.x + inset)}" y="${number(art.y + inset)}" width="${number(art.width - inset * 2)}" height="${number(height - inset * 2)}" rx="${number(art.width * 0.06)}" fill="${palette.cardBack}"/>`,
    `<rect x="${number(art.x + inset * 2)}" y="${number(art.y + inset * 2)}" width="${number(art.width - inset * 4)}" height="${number(height - inset * 4)}" rx="${number(art.width * 0.04)}" fill="none" stroke="${palette.cardBackLine}" stroke-width="${number(art.width * 0.025)}"/>`,
    "</g>",
  ].join("");
};

const cardOf = (
  palette: Palette,
  art: Extract<SpriteArt, { kind: "Card" }>
): SpriteMarkup => {
  const height = art.width * CARD_RATIO;
  const spill = art.width * 0.14;

  return {
    box: boxAround(
      art.x - spill,
      art.y - spill,
      art.width + spill * 2,
      height + spill * 2
    ),
    markup:
      art.card.length === 0
        ? backOf(palette, art)
        : cardArt(palette, art.card, {
            dim: false,
            turn: art.turn,
            width: art.width,
            x: art.x,
            y: art.y,
          }),
  };
};

const faceOf = (
  palette: Palette,
  theme: Theme,
  art: Extract<SpriteArt, { kind: "Face" }>
): SpriteMarkup => ({
  box: boxAround(art.x, art.y, art.size + 4, art.size + 4),
  markup: faceArt(
    palette,
    { avatar: art.avatar, expression: art.expression, name: "" },
    theme,
    { size: art.size, tagged: false, x: art.x, y: art.y }
  ),
});

export const spriteMarkup = (
  palette: Palette,
  theme: Theme,
  art: SpriteArt
): SpriteMarkup =>
  Match.value(art).pipe(
    Match.discriminatorsExhaustive("kind")({
      Bar: (bar) => barOf(palette, bar),
      Caption: (caption) => captionOf(palette, caption),
      Card: (card) => cardOf(palette, card),
      Face: (face) => faceOf(palette, theme, face),
      Label: (label) => labelOf(palette, label),
      Pill: (pill) => pillOf(palette, pill),
    })
  );
