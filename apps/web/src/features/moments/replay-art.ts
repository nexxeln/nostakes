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
import type { SpriteArt } from "./replay-plan.js";

export interface SpriteMarkup {
  readonly box: Box;
  readonly markup: string;
}

const MARGIN = 10;

const PILL_HEIGHT = 52;

const PILL_FONT = 30;

const BUTTON_RADIUS = 22;

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

  return {
    box: boxAround(art.x - width / 2, art.y - art.size, width, art.size * 1.4),
    markup: `<text x="${art.x}" y="${art.y}" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="${art.tone === "Ink" ? 700 : 600}" font-size="${art.size}" fill="${art.tone === "Ink" ? palette.ink : palette.muted}">${escaped(art.text)}</text>`,
  };
};

const pillOf = (
  palette: Palette,
  art: Extract<SpriteArt, { kind: "Pill" }>
): SpriteMarkup => {
  const width = textWidth(art.text, PILL_FONT) + PILL_FONT * 1.2;
  const x = art.x - width / 2;
  const y = art.y - PILL_HEIGHT / 2;
  const red = art.tone === "Red";

  return {
    box: boxAround(x, y, width + 4, PILL_HEIGHT + 4),
    markup: [
      sheet(palette, {
        fill: red ? RED : palette.face,
        height: PILL_HEIGHT,
        lift: 3,
        radius: 14,
        width: number(width),
        x: number(x),
        y: number(y),
      }),
      `<text x="${art.x}" y="${number(art.y + PILL_FONT * 0.36)}" text-anchor="middle" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="${PILL_FONT}" fill="${red ? ON_RED : palette.ink}">${escaped(art.text)}</text>`,
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

const buttonOf = (
  palette: Palette,
  art: Extract<SpriteArt, { kind: "Button" }>
): SpriteMarkup => ({
  box: boxAround(
    art.x - BUTTON_RADIUS,
    art.y - BUTTON_RADIUS,
    BUTTON_RADIUS * 2 + 4,
    BUTTON_RADIUS * 2 + 4
  ),
  markup: [
    `<circle cx="${art.x + 1.6}" cy="${art.y + 2.4}" r="${BUTTON_RADIUS}" fill="${palette.shadow}"/>`,
    `<circle cx="${art.x}" cy="${art.y}" r="${BUTTON_RADIUS}" fill="${palette.face}"/>`,
    `<text x="${art.x}" y="${art.y + 8}" text-anchor="middle" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="22" fill="${palette.ink}">D</text>`,
  ].join(""),
});

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
      Button: (button) => buttonOf(palette, button),
      Card: (card) => cardOf(palette, card),
      Face: (face) => faceOf(palette, theme, face),
      Label: (label) => labelOf(palette, label),
      Pill: (pill) => pillOf(palette, pill),
    })
  );
