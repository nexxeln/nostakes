import { Option } from "effect";

import { choicesOf, PLACED_PARTS } from "./avatar.js";
import type {
  Avatar,
  Expression,
  Part,
  PlacedPart,
  Species,
} from "./avatar.js";
import { layersOf } from "./layers.js";
import type { Point, Polygon } from "./paper.js";
import type { Piece } from "./sheets.js";
import { BUILDS } from "./species.js";

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const FACE_BOX: Box = { height: 100, width: 100, x: 0, y: 0 };

const squareAt = ([x, y]: Point, size: number): Box => ({
  height: size,
  width: size,
  x: x - size / 2,
  y: y - size / 2,
});

const boxOfPoints = (points: Polygon): Box => {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);

  return {
    height: Math.max(...ys) - top,
    width: Math.max(...xs) - left,
    x: left,
    y: top,
  };
};

const boxOfPiece = (piece: Piece): Box =>
  piece.kind === "Cut"
    ? boxOfPoints(piece.points)
    : squareAt(piece.at, piece.size);

const around = (boxes: readonly Box[]): Option.Option<Box> => {
  if (boxes.length === 0) {
    return Option.none();
  }

  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));

  return Option.some({
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  });
};

export const isPlaced = (part: Part): part is PlacedPart =>
  PLACED_PARTS.some((placed) => placed === part);

const stacked = (
  avatar: Avatar,
  expression: Expression,
  uncovered?: PlacedPart
): readonly Piece[] =>
  layersOf(avatar, expression, BUILDS[avatar.species], uncovered).flat();

const piecesOfPart = (pieces: readonly Piece[], part: PlacedPart) =>
  pieces.filter((piece) => piece.part === part);

export const boxOfPart = (
  avatar: Avatar,
  part: PlacedPart,
  expression: Expression = "Resting"
): Option.Option<Box> =>
  around(piecesOfPart(stacked(avatar, expression, part), part).map(boxOfPiece));

const LARGE_SHARE = 0.35;

const spotOn = (piece: Piece): Point => {
  const box = boxOfPiece(piece);
  const across = box.x + box.width / 2;

  if (piece.kind !== "Cut" || piece.hole.length === 0) {
    return [across, box.y + box.height / 2];
  }

  const hole = boxOfPoints(piece.hole);

  return [across, box.y + (hole.y - box.y) / 2];
};

export const spotsOfPart = (
  avatar: Avatar,
  part: PlacedPart,
  expression: Expression = "Resting"
): readonly Point[] => {
  const pieces = piecesOfPart(stacked(avatar, expression, part), part);
  const areas = pieces.map(boxOfPiece).map((box) => box.width * box.height);
  const largest = Math.max(0, ...areas);

  return pieces.flatMap((piece, index) =>
    (areas[index] ?? 0) >= largest * LARGE_SHARE ? [spotOn(piece)] : []
  );
};

const plainFace = (species: Species): Avatar => ({
  colour: "BlueYellow",
  extra: "None",
  eyes: "Pips",
  eyewear: "None",
  headwear: "None",
  mark: "None",
  mouth: "Line",
  neck: "None",
  rank: "Ace",
  species,
  suit: "Spade",
});

export const reachOfPart = (species: Species, part: PlacedPart): Box =>
  around(
    choicesOf(part).flatMap((choice) =>
      Option.toArray(
        boxOfPart({ ...plainFace(species), [part]: choice }, part, "Resting")
      )
    )
  ).pipe(Option.getOrElse(() => FACE_BOX));

const crosses = ([x, y]: Point, [ax, ay]: Point, [bx, by]: Point) =>
  ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax;

const within = (point: Point, polygon: Polygon): boolean =>
  polygon.filter((corner, index) =>
    crosses(point, corner, polygon[(index + 1) % polygon.length] ?? corner)
  ).length %
    2 ===
  1;

const SAMPLES_ACROSS = 9;

const gridOver = (box: Box): readonly Point[] =>
  Array.from({ length: SAMPLES_ACROSS * SAMPLES_ACROSS }, (_, index): Point => [
    box.x + ((index % SAMPLES_ACROSS) + 0.5) * (box.width / SAMPLES_ACROSS),
    box.y +
      (Math.floor(index / SAMPLES_ACROSS) + 0.5) *
        (box.height / SAMPLES_ACROSS),
  ]);

const pointsOn = (piece: Piece): readonly Point[] =>
  piece.kind === "Cut"
    ? gridOver(boxOfPiece(piece)).filter(
        (point) => within(point, piece.points) && !within(point, piece.hole)
      )
    : gridOver(boxOfPiece(piece));

const hides = (piece: Piece, point: Point): boolean =>
  piece.kind === "Cut" &&
  within(point, piece.points) &&
  !within(point, piece.hole);

const COVERED_SHARE = 0.2;

const meets = (one: Box, other: Box): boolean =>
  one.x < other.x + other.width &&
  other.x < one.x + one.width &&
  one.y < other.y + other.height &&
  other.y < one.y + one.height;

interface Above {
  readonly piece: Piece;
  readonly box: Box;
  readonly at: number;
}

export const coversOfPart = (
  avatar: Avatar,
  part: PlacedPart,
  expression: Expression = "Resting"
): readonly PlacedPart[] => {
  const pieces = stacked(avatar, expression, part);

  const held = pieces.flatMap((piece, at) =>
    piece.part === part ? [{ at, box: boxOfPiece(piece), piece }] : []
  );

  const above = pieces.flatMap((piece, at): readonly Above[] => {
    if (
      piece.kind !== "Cut" ||
      piece.part === undefined ||
      piece.part === part
    ) {
      return [];
    }

    const box = boxOfPiece(piece);

    return held.some((under) => under.at < at && meets(under.box, box))
      ? [{ at, box, piece }]
      : [];
  });

  if (above.length === 0) {
    return [];
  }

  const seen = held.flatMap(({ at, piece }) =>
    pointsOn(piece).map((point) => ({ at, point }))
  );

  return PLACED_PARTS.filter((other) => {
    const others = above.filter(({ piece }) => piece.part === other);

    const hidden = seen.filter(({ at, point }) =>
      others.some((cover) => cover.at > at && hides(cover.piece, point))
    );

    return (
      others.length > 0 &&
      seen.length > 0 &&
      hidden.length / seen.length >= COVERED_SHARE
    );
  });
};

const CLEAR_MARGIN = 2;

const FURTHEST_ASIDE = 30;

const UP_WINS_WITHIN = 8;

const far = (distance: number) => Math.min(distance, FURTHEST_ASIDE);

export const asideFrom = (held: Box, cover: Box): Point => {
  const up = cover.y + cover.height - held.y + CLEAR_MARGIN;
  const down = held.y + held.height - cover.y + CLEAR_MARGIN;
  const left = cover.x + cover.width - held.x + CLEAR_MARGIN;
  const right = held.x + held.width - cover.x + CLEAR_MARGIN;
  const least = Math.min(up, down, left, right);

  if (up <= least + UP_WINS_WITHIN) {
    return [0, -far(up)];
  }

  if (least === down) {
    return [0, far(down)];
  }

  return least === left ? [-far(left), 0] : [far(right), 0];
};

interface Framing {
  readonly pad: number;
  readonly least: number;
  readonly centred: boolean;
}

const FRAMING: Readonly<Record<PlacedPart, Framing>> = {
  extra: { centred: false, least: 34, pad: 5 },
  eyes: { centred: false, least: 30, pad: 5 },
  eyewear: { centred: false, least: 40, pad: 4 },
  headwear: { centred: false, least: 50, pad: 4 },
  mark: { centred: false, least: 34, pad: 4 },
  mouth: { centred: false, least: 34, pad: 5 },
  neck: { centred: false, least: 40, pad: 5 },
  rank: { centred: true, least: 26, pad: 4 },
};

const WIDEST_VIEW = 104;

const FACE_MIDDLE: Point = [50, 54];

const toward = (
  middle: number,
  faceMiddle: number,
  span: number,
  view: number
) => {
  const spare = Math.max(0, (view - span) / 2);

  return Math.min(Math.max(faceMiddle, middle - spare), middle + spare);
};

const wholeFace = (aspect: number): Box => {
  const width = aspect >= 1 ? WIDEST_VIEW * aspect : WIDEST_VIEW;
  const height = width / aspect;

  return {
    height,
    width,
    x: FACE_MIDDLE[0] - width / 2,
    y: FACE_MIDDLE[1] - height / 2,
  };
};

export const placeOfPart = (part: Part): Option.Option<PlacedPart> => {
  if (part === "suit") {
    return Option.some("rank");
  }

  return isPlaced(part) ? Option.some(part) : Option.none();
};

const closeUpOn = (avatar: Avatar, part: PlacedPart, aspect: number): Box => {
  const reach = reachOfPart(avatar.species, part);

  const zone =
    part === "mark"
      ? boxOfPart(avatar, part).pipe(Option.getOrElse(() => reach))
      : reach;

  const framing = FRAMING[part];
  const spanX = Math.max(zone.width + framing.pad * 2, framing.least);
  const spanY = Math.max(zone.height + framing.pad * 2, framing.least);
  const width = Math.min(Math.max(spanX, spanY * aspect), WIDEST_VIEW);
  const height = width / aspect;
  const middleX = zone.x + zone.width / 2;
  const middleY = zone.y + zone.height / 2;

  const [x, y] = framing.centred
    ? [middleX, middleY]
    : [
        toward(middleX, FACE_MIDDLE[0], spanX, width),
        toward(middleY, FACE_MIDDLE[1], spanY, height),
      ];

  return { height, width, x: x - width / 2, y: y - height / 2 };
};

export const closeUpOf = (avatar: Avatar, part: Part, aspect = 1): Box =>
  placeOfPart(part).pipe(
    Option.match({
      onNone: () => wholeFace(aspect),
      onSome: (placed) => closeUpOn(avatar, placed, aspect),
    })
  );
