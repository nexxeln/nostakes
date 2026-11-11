import {
  cardArt,
  escaped,
  markArt,
  paletteFor,
  paperSvg,
} from "../pictures/paper.js";
import type { Palette, PictureLook } from "../pictures/paper.js";
import { HABITS, RANKING } from "./guide.js";
import type { Ranked } from "./guide.js";

const LEFT = 92;

const ROW = 94;

const FIRST_ROW = 204;

const CARD = 58;

const words = (
  palette: Palette,
  text: string,
  place: {
    readonly fill: string;
    readonly size: number;
    readonly weight: number;
    readonly x: number;
    readonly y: number;
  }
) =>
  `<text x="${place.x}" y="${place.y}" font-family="Figtree, sans-serif" font-weight="${place.weight}" font-size="${place.size}" fill="${place.fill}">${escaped(text)}</text>`;

const rowArt = (palette: Palette, ranked: Ranked, index: number) => {
  const y = FIRST_ROW + index * ROW;

  return [
    ...ranked.cards.map((card, at) =>
      cardArt(palette, card, {
        dim: false,
        turn: 0,
        width: CARD,
        x: LEFT + at * (CARD + 8),
        y,
      })
    ),
    words(palette, ranked.name, {
      fill: palette.ink,
      size: 38,
      weight: 800,
      x: 446,
      y: y + 36,
    }),
    words(palette, ranked.means, {
      fill: palette.muted,
      size: 26,
      weight: 600,
      x: 446,
      y: y + 70,
    }),
  ].join("");
};

export const LESSON_CARD_TITLE = "what beats what";

export const lessonCardSvg = (look: PictureLook) => {
  const palette = paletteFor(look.theme, look.deck);

  return paperSvg(
    palette,
    look,
    [
      `<text x="${LEFT}" y="158" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="84" letter-spacing="-3" fill="${palette.ink}">What beats what</text>`,
      ...RANKING.map((ranked, index) => rowArt(palette, ranked, index)),
      ...HABITS.map((habit, index) =>
        words(palette, `${index + 1}. ${habit}`, {
          fill: palette.ink,
          size: 29,
          weight: 700,
          x: LEFT,
          y: 1098 + index * 43,
        })
      ),
      markArt(palette, { x: 1080 - 92, y: 1282 }),
    ].join("")
  );
};
