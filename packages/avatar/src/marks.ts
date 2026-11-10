import type { Avatar } from "./avatar.js";
import { band, circle } from "./paper.js";
import type { Point, Polygon } from "./paper.js";
import { flat, glyph, pip, ring, turned } from "./sheets.js";
import type { Piece } from "./sheets.js";
import type { Build } from "./species.js";

const square = (centre: Point, half: number): Polygon => [
  [centre[0] - half, centre[1] - half],
  [centre[0] + half, centre[1] - half],
  [centre[0] + half, centre[1] + half],
  [centre[0] - half, centre[1] + half],
];

const chipMark = (at: Point): readonly Piece[] => [
  ring(circle(at, 6), circle(at, 3.6), "Flat", "Ink"),
  ...[0, 3, 6, 9].map((step) => {
    const angle = (step * Math.PI) / 6 + Math.PI / 4;

    return flat(
      square(
        [at[0] + 4.8 * Math.cos(angle), at[1] + 4.8 * Math.sin(angle)],
        1.05
      ),
      "Stock"
    );
  }),
  flat(circle(at, 1.6), "Ink"),
];

const diceMark = (at: Point): readonly Piece[] =>
  turned(
    [
      flat(square(at, 5.2), "Ink"),
      flat(square([at[0] - 2.6, at[1] - 2.6], 1.05), "Stock"),
      flat(square(at, 1.05), "Stock"),
      flat(square([at[0] + 2.6, at[1] + 2.6], 1.05), "Stock"),
    ],
    14,
    at
  );

const tearUnder = (build: Build): readonly Piece[] => {
  const { left, size } = build.eyes;
  const x = left - size * 0.2;

  const y =
    Math.max(
      build.eyes.y + size * 0.95,
      build.glasses.y + build.glasses.height
    ) + 3;

  return [
    flat(
      [
        [x, y - 3.8],
        [x + 2.2, y],
        [x + 1.6, y + 2],
        [x, y + 2.8],
        [x - 1.6, y + 2],
        [x - 2.2, y],
      ],
      "Ink"
    ),
  ];
};

const scarMark = (at: Point): readonly Piece[] => {
  const [x, y] = at;

  return [
    flat(band([x - 7, y - 5.4], [x + 7, y + 5.4], 2.6), "Stock"),
    ...[-4, 0, 4].map((step) =>
      flat(
        band(
          [x + step * 1.27 - 2, y + step + 2.5],
          [x + step * 1.27 + 2, y + step - 2.5],
          1.2
        ),
        "Ink"
      )
    ),
  ];
};

export const marksFor = (avatar: Avatar, build: Build): readonly Piece[] => {
  const at = build.cheek;
  const [x, y] = at;

  if (avatar.mark === "Pips") {
    return [-1, 0, 1].map((step) =>
      pip(avatar.suit, [x + step * 5.2, y + step * 3.4], 5, "Ink")
    );
  }

  if (avatar.mark === "Index") {
    return [
      glyph(avatar.rank, [x, y - 3.4], 7, "Ink"),
      pip(avatar.suit, [x, y + 3.6], 5.6, "Ink"),
    ];
  }

  if (avatar.mark === "Chip") {
    return chipMark(at);
  }

  if (avatar.mark === "Dice") {
    return diceMark(at);
  }

  if (avatar.mark === "Teardrop") {
    return tearUnder(build);
  }

  return avatar.mark === "Scar" ? scarMark(at) : [];
};
