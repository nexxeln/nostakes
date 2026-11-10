import type { Rank, Suit, Theme } from "./avatar.js";
import { BLUE, GREEN, GROUNDS, INK, PINK, RED, YELLOW } from "./palette.js";
import type { Pair } from "./palette.js";
import {
  between,
  centroid,
  clipBelow,
  cutPath,
  fmt,
  seeded,
  seedOf,
  turnPoint,
} from "./paper.js";
import type { Point, Polygon } from "./paper.js";
import { GLYPHS, SUIT_PATHS } from "./prints.js";

export type Role = "Fin" | "Body" | "Stock" | "Ink" | "Gold" | "Flat";

export type Paint =
  | "Body"
  | "Fin"
  | "Stock"
  | "Ink"
  | "Gold"
  | "Red"
  | "Blue"
  | "Green"
  | "Pink"
  | "Accent";

export interface Cut {
  readonly kind: "Cut";
  readonly points: Polygon;
  readonly hole: Polygon;
  readonly role: Role;
  readonly paint: Paint;
  readonly seed: number;
  readonly pinned: ReadonlySet<number>;
  readonly rise: number;
}

export interface Pip {
  readonly kind: "Pip";
  readonly suit: Suit;
  readonly at: Point;
  readonly size: number;
  readonly paint: Paint;
  readonly turn: number;
}

export interface Glyph {
  readonly kind: "Glyph";
  readonly rank: Rank;
  readonly at: Point;
  readonly size: number;
  readonly paint: Paint;
  readonly turn: number;
}

export type Piece = Cut | Pip | Glyph;

const NO_PINS: ReadonlySet<number> = new Set();

const PAINT_OF_ROLE: Readonly<Record<Role, Paint>> = {
  Body: "Body",
  Fin: "Fin",
  Flat: "Stock",
  Gold: "Gold",
  Ink: "Ink",
  Stock: "Stock",
};

export const cut = (
  points: Polygon,
  role: Role,
  paint: Paint = PAINT_OF_ROLE[role]
): Cut => ({
  hole: [],
  kind: "Cut",
  paint,
  pinned: NO_PINS,
  points,
  rise: 1,
  role,
  seed: seedOf(points),
});

export const ring = (
  points: Polygon,
  hole: Polygon,
  role: Role,
  paint: Paint = PAINT_OF_ROLE[role]
): Cut => ({ ...cut(points, role, paint), hole });

export const flat = (points: Polygon, paint: Paint): Cut =>
  cut(points, "Flat", paint);

export const pip = (
  suit: Suit,
  at: Point,
  size: number,
  paint: Paint,
  turn = 0
): Pip => ({ at, kind: "Pip", paint, size, suit, turn });

export const glyph = (
  rank: Rank,
  at: Point,
  size: number,
  paint: Paint,
  turn = 0
): Glyph => ({ at, kind: "Glyph", paint, rank, size, turn });

export const suitPaint = (suit: Suit): Paint =>
  suit === "Heart" || suit === "Diamond" ? "Red" : "Ink";

export const cornerIndex = (
  rank: Rank,
  suit: Suit,
  at: Point,
  size: number
): readonly Piece[] => [
  glyph(rank, at, size, suitPaint(suit)),
  pip(suit, [at[0], at[1] + size * 0.95], size * 0.8, suitPaint(suit)),
];

export const scaled = (points: Polygon, centre: Point, size: number): Polygon =>
  points.map(([x, y]): Point => [centre[0] + x * size, centre[1] + y * size]);

const moveEach = (
  pieces: readonly Piece[],
  move: (point: Point) => Point,
  turn: number
): readonly Piece[] =>
  pieces.map((piece): Piece => {
    if (piece.kind === "Cut") {
      return {
        ...piece,
        hole: piece.hole.map(move),
        points: piece.points.map(move),
      };
    }

    return { ...piece, at: move(piece.at), turn: piece.turn + turn };
  });

export const turned = (
  pieces: readonly Piece[],
  degrees: number,
  about: Point
): readonly Piece[] =>
  degrees === 0
    ? pieces
    : moveEach(pieces, (point) => turnPoint(point, degrees, about), degrees);

export const raised = (
  pieces: readonly Piece[],
  rise: number
): readonly Piece[] =>
  rise === 1
    ? pieces
    : pieces.map((piece): Piece =>
        piece.kind === "Cut" ? { ...piece, rise: piece.rise * rise } : piece
      );

export const shifted = (
  pieces: readonly Piece[],
  dx: number,
  dy: number
): readonly Piece[] =>
  dx === 0 && dy === 0
    ? pieces
    : moveEach(pieces, ([x, y]): Point => [x + dx, y + dy], 0);

const lowest = (piece: Piece): number =>
  piece.kind === "Cut"
    ? Math.max(...piece.points.map(([, y]) => y))
    : piece.at[1] + piece.size / 2;

export const keptBelow = (
  pieces: readonly Piece[],
  line: number
): readonly Piece[] =>
  pieces.flatMap((piece): readonly Piece[] => {
    if (lowest(piece) <= line) {
      return [];
    }

    if (piece.kind !== "Cut") {
      return piece.at[1] >= line ? [piece] : [];
    }

    if (Math.min(...piece.points.map(([, y]) => y)) >= line) {
      return [piece];
    }

    const clipped = clipBelow(piece.points, line);

    return clipped.points.length < 3
      ? []
      : [
          {
            ...piece,
            hole: [],
            pinned: clipped.pinned,
            points: clipped.points,
          },
        ];
  });

export interface Stage {
  readonly theme: Theme;
  readonly px: number;
  readonly pair: Pair;
}

const STACK: Readonly<Record<Role, number>> = {
  Body: 1,
  Fin: 0.9,
  Flat: 0,
  Gold: 1.9,
  Ink: 1.7,
  Stock: 1.35,
};

const HOUSE_DEPTH = 1.15;

const SHADOW_REACH = 1.8;

const SHADOW_FLOOR_PX = 1.4;

const EDGE_BELOW_PX = 56;

const EDGE_FLOOR_PX = 1.5;

const SMALLEST_GLYPH_PX = 3;

const SHADOW_DIRECTION: Point = [0.55, 1];

const GAP_PX = 0.55;

const LIGHT_OFFSET: Point = [-0.7, -0.8];

const PLACEMENT = 1.5;

const FIXED_PAINTS: Readonly<
  Record<"Ink" | "Gold" | "Red" | "Blue" | "Green" | "Pink", string>
> = {
  Blue: BLUE,
  Gold: YELLOW,
  Green: GREEN,
  Ink: INK,
  Pink: PINK,
  Red: RED,
};

export const paintOf = (paint: Paint, stage: Stage): string => {
  if (paint === "Body") {
    return stage.pair.body;
  }

  if (paint === "Fin") {
    return stage.pair.fin;
  }

  if (paint === "Stock") {
    return GROUNDS[stage.theme].stock;
  }

  if (paint === "Accent") {
    return stage.pair.body === RED ? BLUE : RED;
  }

  return FIXED_PAINTS[paint];
};

export const sheet = (
  d: string,
  fill: string,
  lift: number,
  stage: Stage,
  extra = ""
): string => {
  if (lift <= 0) {
    return `<path d="${d}" fill="${fill}"${extra}/>`;
  }

  const ground = GROUNDS[stage.theme];
  const unitsPerPx = 100 / stage.px;
  const small = stage.px < EDGE_BELOW_PX;
  const floor = small ? EDGE_FLOOR_PX : SHADOW_FLOOR_PX;
  const reach = Math.max(SHADOW_REACH, floor * unitsPerPx) * lift;
  const gap = Math.max(GAP_PX * unitsPerPx, 0.5) * 2;

  return `<path d="${d}" fill="${small ? ground.edge : ground.shadow}" transform="translate(${fmt(SHADOW_DIRECTION[0] * reach)} ${fmt(SHADOW_DIRECTION[1] * reach)})"${extra}/><path d="${d}" fill="none" stroke="${ground.gap}" stroke-width="${fmt(gap)}" stroke-linejoin="round"/><path d="${d}" fill="${ground.light}" transform="translate(${fmt(LIGHT_OFFSET[0] * unitsPerPx)} ${fmt(LIGHT_OFFSET[1] * unitsPerPx)})"${extra}/><path d="${d}" fill="${fill}"${extra}/>`;
};

const drawCut = (piece: Cut, stage: Stage): string => {
  const outer = cutPath(piece.points, piece.seed, piece.pinned);

  const d =
    piece.hole.length === 0
      ? outer
      : `${outer}${cutPath(piece.hole, piece.seed + 1, NO_PINS)}`;

  const extra = piece.hole.length === 0 ? "" : ` fill-rule="evenodd"`;
  const lift = STACK[piece.role] * HOUSE_DEPTH * piece.rise;
  const drawn = sheet(d, paintOf(piece.paint, stage), lift, stage, extra);

  if (lift <= 0) {
    return drawn;
  }

  const random = seeded(piece.seed);
  const [cx, cy] = centroid(piece.points);
  const turn = between(random, -PLACEMENT, PLACEMENT);
  const dx = between(random, -PLACEMENT * 0.35, PLACEMENT * 0.35);
  const dy = between(random, -PLACEMENT * 0.35, PLACEMENT * 0.35);

  return `<g transform="translate(${fmt(dx)} ${fmt(dy)}) rotate(${fmt(turn)} ${fmt(cx)} ${fmt(cy)})">${drawn}</g>`;
};

const placement = (at: Point, turn: number, size: number, unit: number) =>
  `translate(${fmt(at[0])} ${fmt(at[1])})${turn === 0 ? "" : ` rotate(${fmt(turn)})`} scale(${fmt(size / unit)})`;

const GLYPH_STROKE = 2.3;

const drawPiece = (piece: Piece, stage: Stage): string => {
  if (piece.kind === "Cut") {
    return drawCut(piece, stage);
  }

  if (piece.kind === "Pip") {
    return `<path d="${SUIT_PATHS[piece.suit]}" fill="${paintOf(piece.paint, stage)}" transform="${placement(piece.at, piece.turn, piece.size, 100)} translate(-50 -50)"/>`;
  }

  if ((piece.size * stage.px) / 100 < SMALLEST_GLYPH_PX) {
    return "";
  }

  return `<path d="${GLYPHS[piece.rank]}" fill="none" stroke="${paintOf(piece.paint, stage)}" stroke-width="${GLYPH_STROKE}" stroke-linecap="round" stroke-linejoin="round" transform="${placement([piece.at[0], piece.at[1] - piece.size * 0.08], piece.turn, piece.size * 0.875, 10)}"/>`;
};

export const drawPieces = (pieces: readonly Piece[], stage: Stage): string =>
  pieces.map((piece) => drawPiece(piece, stage)).join("");
