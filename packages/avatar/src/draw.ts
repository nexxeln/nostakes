import type { Avatar, Expression, Suit, Theme } from "./avatar.js";
import { browsFor, eyesFor, mouthFor } from "./features.js";
import { marksFor } from "./marks.js";
import { PAIRS } from "./palette.js";
import { cutPath, fmt, foldDown } from "./paper.js";
import {
  cut,
  drawPieces,
  flat,
  keptBelow,
  paintOf,
  pip,
  raised,
  sheet,
  shifted,
  suitPaint,
  turned,
} from "./sheets.js";
import type { Piece, Stage } from "./sheets.js";
import { BUILDS } from "./species.js";
import type { Build } from "./species.js";
import {
  extraFor,
  eyewearFor,
  glassesHideEyes,
  headwearFor,
  neckwearFor,
} from "./wardrobe.js";

export interface RenderOptions {
  readonly expression: Expression;
  readonly size: number;
  readonly theme?: Theme;
  readonly layers?: boolean;
}

const heldCard = (left: number, turn: number, suit: Suit): readonly Piece[] =>
  turned(
    [
      cut(
        [
          [left, 70],
          [left + 17, 70],
          [left + 17, 95],
          [left, 95],
        ],
        "Stock"
      ),
      flat(
        [
          [left + 2.4, 72.4],
          [left + 14.6, 72.4],
          [left + 14.6, 92.6],
          [left + 2.4, 92.6],
        ],
        "Ink"
      ),
      pip(suit, [left + 8.5, 82.5], 6, "Stock"),
    ],
    turn,
    [left + 8.5 - turn * 0.1, 84]
  );

const heldCards = (suit: Suit): readonly Piece[] => [
  ...heldCard(33, -12, suit),
  ...heldCard(50, 10, suit),
];

interface Mood {
  readonly rise: number;
  readonly dy: number;
}

const MOODS: Partial<Record<Expression, Mood>> = {
  Gutted: { dy: 1.2, rise: 0.7 },
  Happy: { dy: -1.6, rise: 1.45 },
};

const STILL: Mood = { dy: 0, rise: 1 };

const moved = (pieces: readonly Piece[], mood: Mood): readonly Piece[] =>
  raised(shifted(pieces, 0, mood.dy), mood.rise);

const shadesDown = (avatar: Avatar, expression: Expression) =>
  avatar.eyewear === "Shades" && expression === "LookingDown";

const layersOf = (
  avatar: Avatar,
  expression: Expression,
  build: Build
): readonly (readonly Piece[])[] => {
  const hat = headwearFor(avatar.headwear, build.hat, avatar.suit);
  const mood = MOODS[expression] ?? STILL;

  const eyes = glassesHideEyes(avatar.eyewear, expression)
    ? []
    : eyesFor(
        avatar.eyes,
        avatar.suit,
        shadesDown(avatar, expression) ? "Resting" : expression,
        build.eyes
      );

  const brows = shadesDown(avatar, expression)
    ? []
    : browsFor(expression, build.eyes, build.brows);

  return [
    build.behind(avatar.rank, avatar.suit),
    hat.behind,
    build.body,
    marksFor(avatar, build),
    build.front(avatar.rank, avatar.suit),
    moved(eyes, mood),
    moved(brows, mood),
    moved(
      eyewearFor(avatar.eyewear, expression, build.eyes, build.glasses),
      mood
    ),
    moved(mouthFor(avatar.mouth, expression, build.mouth), mood),
    neckwearFor(avatar.neck, avatar.suit, build.neck),
    moved(hat.front, mood),
    moved(extraFor(avatar.extra, expression, build.mouth), mood),
    expression === "LookingDown" ? heldCards(avatar.suit) : [],
  ];
};

const FLAP_LIFT = 1;

const FLAP_SEED = 7;

const flapOf = (avatar: Avatar, build: Build, stage: Stage): string =>
  `${build.outline
    .map((outline) => {
      const clipped = foldDown(outline, build.fold);

      return clipped.points.length < 3
        ? ""
        : sheet(
            cutPath(clipped.points, FLAP_SEED, clipped.pinned),
            paintOf("Stock", stage),
            FLAP_LIFT,
            stage
          );
    })
    .join(
      ""
    )}${drawPieces([pip(avatar.suit, [50, build.fold + 10], 12, suitPaint(avatar.suit))], stage)}`;

const marked = (layer: number, art: string, layers: boolean) =>
  layers && art !== ""
    ? `<g class="sheet" style="--sheet:${layer}">${art}</g>`
    : art;

export const render = (
  avatar: Avatar,
  { expression, layers = false, size, theme = "Light" }: RenderOptions
): string => {
  const build = BUILDS[avatar.species];

  const stage: Stage = {
    pair: PAIRS[avatar.colour],
    px: size,
    theme,
  };

  const folded = expression === "Folded";

  const drawn = layersOf(avatar, expression, build).map((pieces) =>
    drawPieces(folded ? keptBelow(pieces, build.fold) : pieces, stage)
  );

  const flap = folded ? [flapOf(avatar, build, stage)] : [];

  const sheets = [...drawn, ...flap].filter((layer) => layer !== "");
  const art = sheets.map((layer, index) => marked(index, layer, layers));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${fmt(size)}" height="${fmt(size)}" overflow="visible">${art.join("")}</svg>`;
};
