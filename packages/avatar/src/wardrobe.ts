import type {
  Expression,
  Extra,
  Eyewear,
  Headwear,
  Neckwear,
  Suit,
} from "./avatar.js";
import type { EyeAnchor, MouthAnchor } from "./features.js";
import { band, circle } from "./paper.js";
import type { Point, Polygon } from "./paper.js";
import { cut, flat, pip, ring, shifted, suitPaint, turned } from "./sheets.js";
import type { Paint, Piece, Role } from "./sheets.js";
import type { GlassesAnchor, HatAnchor, NeckAnchor } from "./species.js";

const GLASSES_TILT: Partial<Record<Expression, number>> = {
  Gutted: -9,
  Thinking: 6,
};

const GLASSES_SLIDE = 5.5;

export const glassesHideEyes = (
  eyewear: Eyewear,
  expression: Expression
): boolean => eyewear === "Shades" && expression !== "LookingDown";

const worn = (
  pieces: readonly Piece[],
  expression: Expression,
  centre: Point
): readonly Piece[] =>
  expression === "LookingDown"
    ? shifted(pieces, 0, GLASSES_SLIDE)
    : turned(pieces, GLASSES_TILT[expression] ?? 0, centre);

const shades = (
  eyes: EyeAnchor,
  glasses: GlassesAnchor,
  expression: Expression
): readonly Piece[] => {
  const { left: lx, right: rx } = eyes;
  const { height, inner, outer, y } = glasses;

  const glints =
    expression === "Happy"
      ? [
          flat(
            [
              [lx - 9, y + 10],
              [lx - 2, y + 3],
              [lx + 0.4, y + 3],
              [lx - 6.6, y + 10],
            ],
            "Stock"
          ),
          flat(
            [
              [rx - 7, y + 10],
              [rx, y + 3],
              [rx + 2.4, y + 3],
              [rx - 4.6, y + 10],
            ],
            "Stock"
          ),
        ]
      : [];

  return [
    cut(
      [
        [lx - outer, y - 1],
        [lx + inner, y + 1],
        [lx + inner - 2, y + height],
        [lx - outer + 6, y + height - 1],
      ],
      "Ink"
    ),
    cut(
      [
        [rx - inner, y + 1],
        [rx + outer, y - 2],
        [rx + outer - 6, y + height - 1],
        [rx - inner + 2, y + height],
      ],
      "Ink"
    ),
    flat(
      [
        [lx + inner - 3, y + 1.6],
        [rx - inner + 3, y + 1.6],
        [rx - inner + 3, y + 4.4],
        [lx + inner - 3, y + 4.4],
      ],
      "Ink"
    ),
    ...glints,
  ];
};

const rims = (eyes: EyeAnchor): readonly Piece[] => {
  const { left: lx, right: rx, size: s, y } = eyes;
  const outer = s * 0.98;
  const inner = s * 0.74;

  return [
    ring(circle([lx, y], outer), circle([lx, y], inner), "Gold"),
    ring(circle([rx, y], outer), circle([rx, y], inner), "Gold"),
    flat(
      band(
        [lx + outer - 0.6, y - s * 0.2],
        [rx - outer + 0.6, y - s * 0.2],
        1.8
      ),
      "Gold"
    ),
  ];
};

const monocle = (eyes: EyeAnchor): readonly Piece[] => {
  const { right: rx, size: s, y } = eyes;
  const outer = s * 1.02;
  const start: Point = [rx + outer * 0.62, y + outer * 0.72];

  return [
    ...Array.from({ length: 5 }, (_, index) =>
      flat(
        circle(
          [
            start[0] + index * 1.7,
            start[1] + index * 3.4 + index * index * 0.3,
          ],
          0.95
        ),
        "Gold"
      )
    ),
    ring(circle([rx, y], outer), circle([rx, y], s * 0.78), "Gold"),
  ];
};

const patch = (eyes: EyeAnchor, top: number): readonly Piece[] => {
  const { left: lx, right: rx, size: s, y } = eyes;

  return [
    flat(
      band([lx - s * 1.1, y + s * 0.15], [lx + (rx - lx) * 0.62, top], 1.7),
      "Ink"
    ),
    cut(
      [
        [lx - s * 0.86, y - s * 0.5],
        [lx - s * 0.1, y - s * 0.86],
        [lx + s * 0.84, y - s * 0.52],
        [lx + s * 0.8, y + s * 0.42],
        [lx + s * 0.06, y + s * 0.82],
        [lx - s * 0.8, y + s * 0.5],
      ],
      "Ink"
    ),
  ];
};

export const eyewearFor = (
  eyewear: Eyewear,
  expression: Expression,
  eyes: EyeAnchor,
  glasses: GlassesAnchor,
  top: number
): readonly Piece[] => {
  if (expression === "Folded" || eyewear === "None") {
    return [];
  }

  const centre: Point = [(eyes.left + eyes.right) / 2, glasses.y + 6];

  if (eyewear === "Shades") {
    return worn(shades(eyes, glasses, expression), expression, centre);
  }

  if (eyewear === "Round") {
    return worn(rims(eyes), expression, centre);
  }

  if (eyewear === "Monocle") {
    return worn(
      monocle(eyes),
      expression === "LookingDown" ? "Resting" : expression,
      centre
    );
  }

  return patch(eyes, top);
};

const chain = (suit: Suit, neck: NeckAnchor): readonly Piece[] => {
  const { left, right, sag, y } = neck;
  const cx = (left + right) / 2;
  const top = y + sag - 1;

  const links = Array.from({ length: 9 }, (_, index): Piece => {
    const t = index / 8;
    const x = left + t * (right - left);
    const ly = y + Math.sin(t * Math.PI) * sag;

    const points: Polygon = [
      [x - 2.8, ly],
      [x, ly - 2.4],
      [x + 2.8, ly],
      [x, ly + 2.4],
    ];

    return index === 0 ? cut(points, "Gold") : flat(points, "Gold");
  });

  return [
    ...links,
    cut(
      [
        [cx - 4.5, top],
        [cx + 4.5, top],
        [cx + 4.5, top + 9],
        [cx - 4.5, top + 9],
      ],
      "Gold"
    ),
    pip(suit, [cx, top + 4.6], 6.4, suitPaint(suit)),
  ];
};

const bowTie = (neck: NeckAnchor): readonly Piece[] => {
  const cx = (neck.left + neck.right) / 2;
  const y = neck.y + 1.5;

  return [
    cut(
      [
        [cx - 1, y + 1],
        [cx - 11.5, y - 4.6],
        [cx - 10.4, y + 10],
        [cx - 1, y + 5],
      ],
      "Ink",
      "Accent"
    ),
    cut(
      [
        [cx + 1, y + 1],
        [cx + 11.5, y - 4.6],
        [cx + 10.4, y + 10],
        [cx + 1, y + 5],
      ],
      "Ink",
      "Accent"
    ),
    cut(
      [
        [cx - 3, y - 0.6],
        [cx + 3, y - 0.6],
        [cx + 2.6, y + 6.6],
        [cx - 2.6, y + 6.6],
      ],
      "Gold",
      "Accent"
    ),
  ];
};

const bolo = (suit: Suit, neck: NeckAnchor): readonly Piece[] => {
  const { left, right, y } = neck;
  const cx = (left + right) / 2;
  const knot: Point = [cx, y + 6.5];

  return [
    flat(band([cx - 9, y - 2], knot, 2.2), "Ink"),
    flat(band([cx + 9, y - 2], knot, 2.2), "Ink"),
    flat(band([cx - 1.6, knot[1]], [cx - 3, knot[1] + 13], 2), "Ink"),
    flat(band([cx + 1.6, knot[1]], [cx + 3.2, knot[1] + 12], 2), "Ink"),
    cut(band([cx - 3, knot[1] + 11.5], [cx - 3.2, knot[1] + 15.5], 3), "Gold"),
    cut(
      band([cx + 3.2, knot[1] + 10.5], [cx + 3.4, knot[1] + 14.5], 3),
      "Gold"
    ),
    cut(circle(knot, 6), "Gold"),
    pip(suit, knot, 6.4, suitPaint(suit)),
  ];
};

export const neckwearFor = (
  neckwear: Neckwear,
  suit: Suit,
  neck: NeckAnchor
): readonly Piece[] => {
  if (neckwear === "Chain") {
    return chain(suit, neck);
  }

  if (neckwear === "BowTie") {
    return bowTie(neck);
  }

  return neckwear === "Bolo" ? bolo(suit, neck) : [];
};

interface Hat {
  readonly behind: readonly Piece[];
  readonly front: readonly Piece[];
}

const NO_HAT: Hat = { behind: [], front: [] };

const onHead =
  (hat: HatAnchor) =>
  (points: Polygon, role: Role, paint: Paint): Piece =>
    cut(
      points.map(([u, v]): Point => [
        hat.x + u * hat.width,
        hat.y + v * hat.width,
      ]),
      role,
      paint
    );

const printedOnHead =
  (hat: HatAnchor) =>
  (suit: Suit, at: Point, size: number, paint: Paint): Piece =>
    pip(
      suit,
      [hat.x + at[0] * hat.width, hat.y + at[1] * hat.width],
      size * hat.width,
      paint
    );

const flatOnHead =
  (hat: HatAnchor) =>
  (points: Polygon, paint: Paint): Piece =>
    flat(
      points.map(([u, v]): Point => [
        hat.x + u * hat.width,
        hat.y + v * hat.width,
      ]),
      paint
    );

const HAT_TILT: Partial<Record<Headwear, number>> = {
  Cowboy: -3,
  Fedora: -7,
};

const hatPieces = (headwear: Headwear, hat: HatAnchor, suit: Suit): Hat => {
  const sheet = onHead(hat);
  const print = flatOnHead(hat);
  const mark = printedOnHead(hat);

  if (headwear === "Crown") {
    return {
      behind: [
        sheet(
          [
            [-0.46, 0.1],
            [-0.5, -0.38],
            [-0.27, -0.18],
            [-0.12, -0.42],
            [0, -0.22],
            [0.12, -0.42],
            [0.27, -0.18],
            [0.5, -0.38],
            [0.46, 0.1],
          ],
          "Gold",
          "Gold"
        ),
        mark(suit, [0, -0.14], 0.15, suitPaint(suit)),
      ],
      front: [],
    };
  }

  if (headwear === "Cowboy") {
    return {
      behind: [],
      front: [
        sheet(
          [
            [-0.36, 0.02],
            [-0.33, -0.36],
            [-0.24, -0.5],
            [-0.08, -0.52],
            [0, -0.43],
            [0.08, -0.52],
            [0.24, -0.5],
            [0.33, -0.36],
            [0.36, 0.02],
          ],
          "Ink",
          "Gold"
        ),
        print(
          [
            [-0.35, -0.13],
            [0.35, -0.13],
            [0.36, -0.03],
            [-0.36, -0.03],
          ],
          "Ink"
        ),
        sheet(
          [
            [-0.98, -0.18],
            [-0.78, -0.03],
            [-0.42, 0.03],
            [0.42, 0.03],
            [0.78, -0.03],
            [0.98, -0.18],
            [0.86, 0.06],
            [0.5, 0.15],
            [-0.5, 0.15],
            [-0.86, 0.06],
          ],
          "Ink",
          "Gold"
        ),
      ],
    };
  }

  if (headwear === "Fedora") {
    return {
      behind: [],
      front: [
        sheet(
          [
            [-0.37, 0.02],
            [-0.35, -0.34],
            [-0.23, -0.5],
            [-0.05, -0.48],
            [0, -0.4],
            [0.05, -0.48],
            [0.23, -0.5],
            [0.35, -0.34],
            [0.37, 0.02],
          ],
          "Ink",
          "Ink"
        ),
        print(
          [
            [-0.365, -0.15],
            [0.365, -0.15],
            [0.37, -0.02],
            [-0.37, -0.02],
          ],
          "Accent"
        ),
        sheet(
          [
            [-0.74, -0.01],
            [-0.44, -0.06],
            [0.44, -0.06],
            [0.74, -0.03],
            [0.64, 0.09],
            [-0.66, 0.11],
          ],
          "Ink",
          "Ink"
        ),
      ],
    };
  }

  if (headwear === "Visor") {
    return {
      behind: [],
      front: [
        print(
          [
            [-0.52, -0.08],
            [0.52, -0.08],
            [0.52, 0.01],
            [-0.52, 0.01],
          ],
          "Ink"
        ),
        sheet(
          [
            [-0.6, -0.04],
            [0.6, -0.04],
            [0.7, 0.2],
            [0.32, 0.27],
            [-0.32, 0.27],
            [-0.7, 0.2],
          ],
          "Ink",
          "Green"
        ),
      ],
    };
  }

  if (headwear === "Bandana") {
    return {
      behind: [],
      front: [
        sheet(
          [
            [0.44, -0.04],
            [0.74, 0.08],
            [0.66, 0.2],
            [0.42, 0.08],
          ],
          "Ink",
          "Accent"
        ),
        sheet(
          [
            [0.44, -0.02],
            [0.6, 0.26],
            [0.48, 0.32],
            [0.38, 0.06],
          ],
          "Ink",
          "Accent"
        ),
        sheet(
          [
            [-0.55, 0.06],
            [-0.47, -0.2],
            [-0.2, -0.34],
            [0.2, -0.34],
            [0.47, -0.2],
            [0.55, 0.06],
            [0.2, 0.01],
            [-0.2, 0.01],
          ],
          "Ink",
          "Accent"
        ),
        mark(suit, [-0.24, -0.15], 0.1, "Stock"),
        mark(suit, [0.04, -0.21], 0.1, "Stock"),
        mark(suit, [0.3, -0.12], 0.1, "Stock"),
      ],
    };
  }

  if (headwear === "Cap") {
    return {
      behind: [],
      front: [
        sheet(
          [
            [-0.46, 0.04],
            [-0.42, -0.22],
            [-0.2, -0.38],
            [0.2, -0.38],
            [0.42, -0.22],
            [0.46, 0.04],
          ],
          "Ink",
          "Fin"
        ),
        mark(suit, [0, -0.17], 0.15, suitPaint(suit)),
        sheet(
          [
            [-0.5, 0],
            [0.5, 0],
            [0.62, 0.1],
            [0.3, 0.17],
            [-0.3, 0.17],
            [-0.62, 0.1],
          ],
          "Ink",
          "Ink"
        ),
      ],
    };
  }

  return NO_HAT;
};

export const headwearFor = (
  headwear: Headwear,
  hat: HatAnchor,
  suit: Suit
): Hat => {
  const pieces = hatPieces(headwear, hat, suit);
  const tilt = hat.tilt + (HAT_TILT[headwear] ?? 0);
  const about: Point = [hat.x, hat.y];

  return {
    behind: turned(pieces.behind, tilt, about),
    front: turned(pieces.front, tilt, about),
  };
};

export const extraFor = (
  extra: Extra,
  expression: Expression,
  mouth: MouthAnchor
): readonly Piece[] => {
  if (extra === "None" || expression === "Happy") {
    return [];
  }

  const x = mouth.x + mouth.half * 0.78;
  const y = mouth.y + 0.6;

  if (extra === "Toothpick") {
    return [
      cut(
        [
          [x - 1, y - 0.4],
          [x + 14, y + 3.2],
          [x + 13.6, y + 4.6],
          [x - 1.2, y + 1.2],
        ],
        "Stock"
      ),
    ];
  }

  const centre: Point = [x + 3.2, y + 2];

  return [
    cut(circle(centre, 4.6), "Gold", "Accent"),
    ...[0, 3, 6, 9].map((step) => {
      const angle = (step * Math.PI) / 6 + 0.3;

      return flat(
        circle(
          [
            centre[0] + 3.4 * Math.cos(angle),
            centre[1] + 3.4 * Math.sin(angle),
          ],
          0.9
        ),
        "Stock"
      );
    }),
    flat(circle(centre, 1.7), "Stock"),
  ];
};
