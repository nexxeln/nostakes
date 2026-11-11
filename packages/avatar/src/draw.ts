import { Option } from "effect";

import type { Avatar, Expression, Part, PlacedPart, Theme } from "./avatar.js";
import { layersOf } from "./layers.js";
import { PAIRS } from "./palette.js";
import { cutPath, fmt, foldDown } from "./paper.js";
import type { Point } from "./paper.js";
import { asideFrom, boxOfPart, coversOfPart, placeOfPart } from "./parts.js";
import type { Box } from "./parts.js";
import {
  drawPieces,
  drawRuns,
  keptBelow,
  paintOf,
  pip,
  raised,
  sheet,
  shifted,
  suitPaint,
} from "./sheets.js";
import type { Piece, Stage } from "./sheets.js";
import { BUILDS } from "./species.js";
import type { Build } from "./species.js";

export interface RenderOptions {
  readonly expression: Expression;
  readonly size: number;
  readonly theme?: Theme;
  readonly layers?: boolean;
  readonly parts?: boolean;
  readonly lifted?: Part;
  readonly window?: Box;
}

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

interface Handling {
  readonly shift: Point;
  readonly rise: number;
  readonly faded: boolean;
}

type Handlings = ReadonlyMap<PlacedPart, Handling>;

const NO_HANDLINGS: Handlings = new Map();

const LIFT_RISE = 1.9;

const LIFT_SHIFT: Point = [-1.6, -2.9];

const ASIDE_OPACITY = 0.3;

const handlingsFor = (
  avatar: Avatar,
  expression: Expression,
  lifted: PlacedPart
): Handlings =>
  new Map<PlacedPart, Handling>([
    ...Option.match(boxOfPart(avatar, lifted, expression), {
      onNone: () => [],
      onSome: (held) =>
        coversOfPart(avatar, lifted, expression).flatMap((cover) =>
          Option.toArray(boxOfPart(avatar, cover, expression)).map(
            (box): readonly [PlacedPart, Handling] => [
              cover,
              { faded: true, rise: 1, shift: asideFrom(held, box) },
            ]
          )
        ),
    }),
    [lifted, { faded: false, rise: LIFT_RISE, shift: LIFT_SHIFT }],
  ]);

const handled = (
  pieces: readonly Piece[],
  handlings: Handlings
): readonly Piece[] =>
  handlings.size === 0
    ? pieces
    : pieces.flatMap((piece) => {
        const handling =
          piece.part === undefined ? undefined : handlings.get(piece.part);

        return handling === undefined
          ? [piece]
          : raised(
              shifted([piece], handling.shift[0], handling.shift[1]),
              handling.rise
            );
      });

const opened = (handlings: Handlings) => (part: PlacedPart) => {
  const handling = handlings.get(part);

  if (handling === undefined) {
    return `<g data-part="${part}">`;
  }

  const shift = `${fmt(handling.shift[0])} ${fmt(handling.shift[1])}`;

  return handling.faded
    ? `<g data-part="${part}" data-shift="${shift}" opacity="${ASIDE_OPACITY}">`
    : `<g data-part="${part}" data-shift="${shift}">`;
};

const frameOf = (size: number, window: Box | undefined) =>
  window === undefined
    ? `viewBox="0 0 100 100" width="${fmt(size)}" height="${fmt(size)}"`
    : `viewBox="${fmt(window.x)} ${fmt(window.y)} ${fmt(window.width)} ${fmt(window.height)}" preserveAspectRatio="xMidYMid slice"`;

export const render = (
  avatar: Avatar,
  {
    expression,
    layers = false,
    lifted,
    parts = false,
    size,
    theme = "Light",
    window,
  }: RenderOptions
): string => {
  const build = BUILDS[avatar.species];

  const stage: Stage = {
    pair: PAIRS[avatar.colour],
    px: size,
    theme,
  };

  const folded = expression === "Folded";

  const held =
    lifted === undefined
      ? undefined
      : Option.getOrUndefined(placeOfPart(lifted));

  const handlings =
    held === undefined ? NO_HANDLINGS : handlingsFor(avatar, expression, held);

  const open = opened(handlings);

  const drawn = layersOf(avatar, expression, build, held).map((layer) => {
    const pieces = handled(layer, handlings);
    const kept = folded ? keptBelow(pieces, build.fold) : pieces;

    return parts ? drawRuns(kept, stage, open) : drawPieces(kept, stage);
  });

  const flap = folded ? [flapOf(avatar, build, stage)] : [];

  const sheets = [...drawn, ...flap].filter((layer) => layer !== "");
  const art = sheets.map((layer, index) => marked(index, layer, layers));

  return `<svg xmlns="http://www.w3.org/2000/svg" ${frameOf(size, window)} overflow="visible">${art.join("")}</svg>`;
};
