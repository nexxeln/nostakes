import type { Expression, Eyes, Mouth, Suit } from "./avatar.js";
import type { Point, Polygon } from "./paper.js";
import { cut, flat, pip, scaled, suitPaint } from "./sheets.js";
import type { Piece } from "./sheets.js";

export interface EyeAnchor {
  readonly left: number;
  readonly right: number;
  readonly y: number;
  readonly size: number;
}

export interface BrowAnchor {
  readonly y: number;
  readonly half: number;
}

export interface MouthAnchor {
  readonly x: number;
  readonly y: number;
  readonly half: number;
  readonly wide: boolean;
}

const EYE_SCRAP: Polygon = [
  [-0.62, -0.2],
  [-0.2, -0.64],
  [0.55, -0.52],
  [0.68, 0.1],
  [0.2, 0.64],
  [-0.52, 0.52],
];

const NARROW_SCRAP: Polygon = [
  [-0.7, -0.08],
  [-0.24, -0.34],
  [0.6, -0.3],
  [0.72, 0.06],
  [0.24, 0.32],
  [-0.56, 0.28],
];

const BEAD: Polygon = [
  [-0.3, -0.12],
  [-0.12, -0.3],
  [0.12, -0.3],
  [0.3, -0.12],
  [0.3, 0.12],
  [0.12, 0.3],
  [-0.12, 0.3],
  [-0.3, 0.12],
];

const EYE_DROPS: Partial<Record<Expression, number>> = {
  Gutted: 0.1,
  LookingDown: 0.24,
  Thinking: -0.14,
};

const SLEEPY_LID = -0.08;

const chevron = (x: number, y: number, s: number): Piece =>
  cut(
    [
      [x - s * 0.62, y + s * 0.32],
      [x, y - s * 0.42],
      [x + s * 0.62, y + s * 0.32],
      [x + s * 0.36, y + s * 0.46],
      [x, y + 0.02 * s],
      [x - s * 0.36, y + s * 0.46],
    ],
    "Ink"
  );

const lid = (x: number, y: number, s: number, low: number): Piece =>
  cut(
    [
      [x - s * 0.74, y - s * 0.74],
      [x + s * 0.74, y - s * 0.7],
      [x + s * 0.72, y + low],
      [x - s * 0.74, y + low + s * 0.08],
    ],
    "Body"
  );

const pupil = (
  style: Eyes,
  suit: Suit,
  at: Point,
  s: number,
  turn: number
): Piece =>
  style === "Pips" || style === "Sleepy"
    ? pip(suit, at, s * 0.8, suitPaint(suit), turn)
    : flat(scaled(BEAD, at, style === "Slits" ? s * 0.8 : s * 1.3), "Ink");

const lidsFor = (
  style: Eyes,
  expression: Expression,
  anchor: EyeAnchor
): readonly Piece[] => {
  const { left, right, size: s, y } = anchor;

  if (expression === "LookingDown") {
    return [lid(left, y, s, 0), lid(right, y, s, 0)];
  }

  if (expression === "Thinking") {
    return style === "Sleepy"
      ? [lid(left, y, s, SLEEPY_LID * s), lid(right, y, s, -s * 0.2)]
      : [lid(right, y, s, -s * 0.14)];
  }

  return style === "Sleepy"
    ? [lid(left, y, s, SLEEPY_LID * s), lid(right, y, s, SLEEPY_LID * s)]
    : [];
};

export const eyesFor = (
  style: Eyes,
  suit: Suit,
  expression: Expression,
  anchor: EyeAnchor
): readonly Piece[] => {
  const { left, right, size: s, y } = anchor;

  if (expression === "Happy") {
    return [chevron(left, y, s), chevron(right, y, s)];
  }

  const drop = (EYE_DROPS[expression] ?? 0) * s;
  const slide = expression === "Thinking" ? s * 0.2 : 0;
  const turn = expression === "Gutted" ? 180 : 0;
  const scrap = style === "Slits" ? NARROW_SCRAP : EYE_SCRAP;
  const squint = style === "Slits" ? 0.4 : 1;
  const white = style === "Beads" ? s * 0.78 : s;

  return [
    cut(scaled(scrap, [left, y], white), "Stock"),
    cut(scaled(scrap, [right, y], white), "Stock"),
    pupil(style, suit, [left + slide, y + drop * squint], s, turn),
    pupil(style, suit, [right + slide, y + drop * squint], s, turn),
    ...(style === "Slits" ? [] : lidsFor(style, expression, anchor)),
  ];
};

const BROW_SLANTS: Partial<Record<Expression, number>> = {
  Gutted: -3.2,
  Thinking: 0,
};

const DEFAULT_SLANT = 2.4;

export const browsFor = (
  expression: Expression,
  eyes: EyeAnchor,
  brow: BrowAnchor
): readonly Piece[] => {
  if (expression === "Happy" || expression === "Folded") {
    return [];
  }

  const { left: lx, right: rx } = eyes;
  const { half: w, y } = brow;
  const slant = BROW_SLANTS[expression] ?? DEFAULT_SLANT;

  const leftBrow: Polygon = [
    [lx - w, y - slant * 0.6],
    [lx + w, y + slant * 0.6],
    [lx + w, y + slant * 0.6 + 2.8],
    [lx - w, y - slant * 0.6 + 2.2],
  ];

  const rightBrow: Polygon =
    expression === "Thinking"
      ? [
          [rx - w, y - 3.4],
          [rx + w, y - 5.6],
          [rx + w, y - 2.8],
          [rx - w, y - 1],
        ]
      : [
          [rx + w, y - slant * 0.6],
          [rx - w, y + slant * 0.6],
          [rx - w, y + slant * 0.6 + 2.8],
          [rx + w, y - slant * 0.6 + 2.2],
        ];

  return [cut(leftBrow, "Ink"), cut(rightBrow, "Ink")];
};

const openMouth = (anchor: MouthAnchor, style: Mouth): readonly Piece[] => {
  const { half: w, x: cx, y } = anchor;

  if (anchor.wide) {
    return [
      cut(
        [
          [cx - w, y - 2],
          [cx + w, y - 2],
          [cx + w * 0.7, y + 5],
          [cx - w * 0.7, y + 5],
        ],
        "Ink"
      ),
      flat(
        [
          [cx - w * 0.53, y],
          [cx + w * 0.53, y],
          [cx + w * 0.41, y + 3.4],
          [cx - w * 0.41, y + 3.4],
        ],
        "Red"
      ),
    ];
  }

  const teeth = Array.from({ length: 5 }, (_, index): Piece => {
    const x0 = cx - w * 0.9 + (index * w * 1.8) / 5;

    return flat(
      [
        [x0, y - 3],
        [x0 + (w * 1.8) / 5, y - 3],
        [x0 + (w * 0.9) / 5, y + 0.8],
      ],
      style === "GoldTooth" && index === 1 ? "Gold" : "Stock"
    );
  });

  return [
    cut(
      [
        [cx - w, y - 3.4],
        [cx + w, y - 3.4],
        [cx + w * 0.55, y + 8],
        [cx - w * 0.6, y + 7.6],
      ],
      "Ink"
    ),
    flat(
      [
        [cx - w * 0.36, y + 4.4],
        [cx + w * 0.34, y + 4.2],
        [cx + w * 0.24, y + 7.2],
        [cx - w * 0.3, y + 7.2],
      ],
      "Red"
    ),
    ...teeth,
  ];
};

const frown = (anchor: MouthAnchor): readonly Piece[] => {
  const { half: w, x: cx, y } = anchor;

  if (anchor.wide) {
    return [
      cut(
        [
          [cx - w * 0.94, y + 4],
          [cx, y - 3],
          [cx + w * 0.94, y + 4],
          [cx + w * 0.94, y + 6.4],
          [cx, y],
          [cx - w * 0.94, y + 6.4],
        ],
        "Ink"
      ),
    ];
  }

  return [
    cut(
      [
        [cx - w * 0.72, y + 4.6],
        [cx, y - 1.2],
        [cx + w * 0.72, y + 4.6],
        [cx + w * 0.5, y + 6.4],
        [cx, y + 2.2],
        [cx - w * 0.5, y + 6.4],
      ],
      "Ink"
    ),
  ];
};

const pondering = (anchor: MouthAnchor): readonly Piece[] => {
  const { half: w, x: cx, y } = anchor;

  if (anchor.wide) {
    return [
      cut(
        [
          [cx - w * 0.82, y + 2],
          [cx + w * 0.88, y - 3],
          [cx + w * 0.88, y - 0.4],
          [cx - w * 0.82, y + 4.6],
        ],
        "Ink"
      ),
    ];
  }

  return [
    cut(
      [
        [cx - w * 0.15, y + 1.2],
        [cx + w * 0.8, y - 1.4],
        [cx + w * 0.82, y + 1.4],
        [cx - w * 0.12, y + 3.4],
      ],
      "Ink"
    ),
  ];
};

const strip = (anchor: MouthAnchor): Piece => {
  const { half: w, x: cx, y } = anchor;

  return anchor.wide
    ? cut(
        [
          [cx - w * 1.09, y - 4],
          [cx - w * 0.82, y],
          [cx + w * 0.82, y],
          [cx + w * 1.09, y - 4],
          [cx + w * 0.88, y + 3],
          [cx - w * 0.88, y + 3],
        ],
        "Ink"
      )
    : cut(
        [
          [cx - w, y - 1],
          [cx + w, y - 1.8],
          [cx + w * 0.8, y + 2],
          [cx - w * 0.82, y + 2.2],
        ],
        "Ink"
      );
};

const pucker = (x: number, y: number, s: number): readonly Piece[] => [
  cut(
    [
      [x - 6.4 * s, y - 4 * s],
      [x, y - 7.4 * s],
      [x + 6.4 * s, y - 4 * s],
      [x + 6.4 * s, y + 2.4 * s],
      [x, y + 5.6 * s],
      [x - 6.4 * s, y + 2.4 * s],
    ],
    "Stock"
  ),
  flat(
    [
      [x - 2.8 * s, y - 2.6 * s],
      [x + 2.8 * s, y - 2.6 * s],
      [x + 2.8 * s, y + 1.6 * s],
      [x - 2.8 * s, y + 1.6 * s],
    ],
    "Ink"
  ),
];

const restingMouth = (style: Mouth, anchor: MouthAnchor): readonly Piece[] => {
  const { half: w, x: cx, y } = anchor;
  const s = anchor.wide ? 1.4 : Math.min(w / 9.5, 1.3);

  if (style === "Pucker") {
    return pucker(cx, y, s);
  }

  if (style === "Smirk") {
    return [
      cut(
        [
          [cx - w * 0.9, y - 0.4],
          [cx + w * 0.52, y - 1.4],
          [cx + w, y - 5.2],
          [cx + w * 1.04, y - 1],
          [cx + w * 0.6, y + 2],
          [cx - w * 0.8, y + 2.4],
        ],
        "Ink"
      ),
    ];
  }

  if (style === "Grin") {
    return [
      cut(
        [
          [cx - w * 1.04, y - 3],
          [cx + w * 1.04, y - 3.4],
          [cx + w * 0.7, y + 3.4],
          [cx, y + 5.6],
          [cx - w * 0.7, y + 3.6],
        ],
        "Ink"
      ),
      flat(
        [
          [cx - w * 0.82, y - 1.8],
          [cx + w * 0.82, y - 2.1],
          [cx + w * 0.68, y + 0.6],
          [cx - w * 0.68, y + 0.8],
        ],
        "Stock"
      ),
    ];
  }

  if (style === "Fangs") {
    const fang = (x: number): Piece =>
      cut(
        [
          [x - 2.2 * s, y + 1],
          [x + 2.2 * s, y + 1],
          [x, y + 1 + 4.6 * s],
        ],
        "Stock"
      );

    return [fang(cx - w * 0.5), fang(cx + w * 0.5), strip(anchor)];
  }

  if (style === "GoldTooth") {
    return [
      strip(anchor),
      cut(
        [
          [cx - w * 0.42, y],
          [cx - w * 0.42 + 4.2 * s, y - 0.2],
          [cx - w * 0.42 + 4.2 * s, y + 4 * s],
          [cx - w * 0.42, y + 4.2 * s],
        ],
        "Gold"
      ),
    ];
  }

  return [strip(anchor)];
};

export const mouthFor = (
  style: Mouth,
  expression: Expression,
  anchor: MouthAnchor
): readonly Piece[] => {
  if (expression === "Happy") {
    return openMouth(anchor, style);
  }

  if (expression === "Gutted") {
    return frown(anchor);
  }

  if (expression === "Thinking") {
    return style === "Pucker"
      ? restingMouth(style, { ...anchor, x: anchor.x + anchor.half * 0.74 })
      : pondering(anchor);
  }

  return restingMouth(style, anchor);
};
