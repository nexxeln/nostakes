import type { Rank, Species, Suit } from "./avatar.js";
import type { BrowAnchor, EyeAnchor, MouthAnchor } from "./features.js";
import { circle } from "./paper.js";
import type { Point, Polygon } from "./paper.js";
import { cornerIndex, cut, flat, ofPart, turned } from "./sheets.js";
import type { Piece } from "./sheets.js";

export interface GlassesAnchor {
  readonly y: number;
  readonly outer: number;
  readonly inner: number;
  readonly height: number;
}

export interface HatAnchor {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly tilt: number;
}

export interface NeckAnchor {
  readonly y: number;
  readonly left: number;
  readonly right: number;
  readonly sag: number;
}

export interface Build {
  readonly outline: readonly Polygon[];
  readonly fold: number;
  readonly behind: (rank: Rank, suit: Suit) => readonly Piece[];
  readonly body: readonly Piece[];
  readonly front: (rank: Rank, suit: Suit) => readonly Piece[];
  readonly eyes: EyeAnchor;
  readonly brows: BrowAnchor;
  readonly mouth: MouthAnchor;
  readonly glasses: GlassesAnchor;
  readonly hat: HatAnchor;
  readonly neck: NeckAnchor;
  readonly cheek: Point;
}

const nothing = (): readonly Piece[] => [];

const finTab = (rank: Rank, suit: Suit, dx: number): readonly Piece[] =>
  ofPart(
    turned(
      [
        cut(
          [
            [39 + dx, 24],
            [55 + dx, -1],
            [61 + dx, -2],
            [68 + dx, 24],
          ],
          "Stock"
        ),
        ...cornerIndex(rank, suit, [58.6 + dx, 5], 5.4),
      ],
      -8,
      [60 + dx, 12]
    ),
    "rank"
  );

const tuckedCard = (
  rank: Rank,
  suit: Suit,
  corner: Point,
  turn: number
): readonly Piece[] => {
  const [x, y] = corner;

  return ofPart(
    turned(
      [
        cut(
          [
            [x, y],
            [x + 16, y],
            [x + 16, y + 20],
            [x, y + 20],
          ],
          "Stock"
        ),
        ...cornerIndex(rank, suit, [x + 4.4, y + 4.6], 5),
      ],
      turn,
      [x + 8, y + 10]
    ),
    "rank"
  );
};

const finPair = (left: Polygon): readonly Piece[] => [
  cut(left, "Fin"),
  cut(
    left.map(([x, y]): Point => [100 - x, y]),
    "Fin"
  ),
];

const SHARK_HEAD: Polygon = [
  [15, 53],
  [21, 30],
  [37, 15],
  [63, 15],
  [80, 29],
  [86, 52],
  [71, 69],
  [29, 69],
];

const SHARK_FIN: Polygon = [
  [37, 22],
  [57, -3],
  [67, 22],
];

const greatWhite: Build = {
  behind: (rank, suit) => [
    ...finTab(rank, suit, 0),
    ...finPair([
      [24, 57],
      [6, 66],
      [11, 72],
      [28, 65],
    ]),
  ],
  body: [
    cut(SHARK_HEAD, "Body"),
    cut(
      [
        [20, 50],
        [81, 50],
        [73, 72],
        [28, 72],
      ],
      "Stock"
    ),
    flat(
      [
        [19, 40],
        [21.5, 39],
        [23.5, 48],
        [21, 49],
      ],
      "Stock"
    ),
    flat(
      [
        [24.5, 41],
        [27, 40],
        [28, 49],
        [25.5, 50],
      ],
      "Stock"
    ),
  ],
  brows: { half: 7.5, y: 25.5 },
  cheek: [74, 52],
  eyes: { left: 37, right: 63, size: 8.4, y: 32 },
  fold: 31,
  front: nothing,
  glasses: { height: 14, inner: 11, outer: 22, y: 32 },
  hat: { tilt: 0, width: 46, x: 50, y: 17 },
  mouth: { half: 17, wide: false, x: 50, y: 56 },
  neck: { left: 28, right: 72, sag: 9, y: 69 },
  outline: [SHARK_HEAD, SHARK_FIN],
};

const FISH_BODY: Polygon = [
  [17, 43],
  [29, 24],
  [50, 18],
  [71, 23],
  [83, 42],
  [77, 61],
  [61, 71],
  [39, 71],
  [23, 61],
];

const FISH_CREST: Polygon = [
  [32, 26],
  [36, 5],
  [57, 3],
  [68, 26],
];

const goldfish: Build = {
  behind: (rank, suit) => [
    ...ofPart(
      [cut(FISH_CREST, "Stock"), ...cornerIndex(rank, suit, [41.5, 9.5], 6)],
      "rank"
    ),
    flat(
      [
        [57, 3],
        [61, 9],
        [68, 26],
      ],
      "Fin"
    ),
    cut(
      [
        [22, 46],
        [2, 36],
        [9, 50],
        [3, 64],
        [22, 58],
      ],
      "Fin"
    ),
    cut(
      [
        [78, 46],
        [98, 36],
        [91, 50],
        [97, 64],
        [78, 58],
      ],
      "Fin"
    ),
  ],
  body: [
    cut(FISH_BODY, "Body"),
    cut(
      [
        [26, 61],
        [40, 56],
        [50, 62],
        [60, 56],
        [74, 61],
        [62, 75],
        [38, 75],
      ],
      "Fin"
    ),
  ],
  brows: { half: 7.5, y: 23.5 },
  cheek: [76, 50],
  eyes: { left: 35, right: 65, size: 15.5, y: 37 },
  fold: 30,
  front: nothing,
  glasses: { height: 17, inner: 13, outer: 21, y: 34 },
  hat: { tilt: 0, width: 44, x: 50, y: 20 },
  mouth: { half: 9.5, wide: false, x: 50, y: 54 },
  neck: { left: 34, right: 66, sag: 7, y: 72 },
  outline: [FISH_BODY, FISH_CREST],
};

const OCTO_HEAD: Polygon = [
  [23, 46],
  [25, 21],
  [38, 6],
  [62, 6],
  [75, 21],
  [77, 46],
  [67, 63],
  [33, 63],
];

const OCTO_ARMS: readonly Polygon[] = [
  [
    [28, 56],
    [13, 59],
    [6, 72],
    [13, 82],
    [18, 77],
    [13, 70],
    [18, 66],
    [32, 64],
  ],
  [
    [72, 56],
    [87, 59],
    [94, 72],
    [87, 82],
    [82, 77],
    [87, 70],
    [82, 66],
    [68, 64],
  ],
  [
    [36, 60],
    [29, 77],
    [20, 91],
    [27, 94],
    [36, 81],
    [44, 62],
  ],
  [
    [64, 60],
    [71, 77],
    [80, 91],
    [73, 94],
    [64, 81],
    [56, 62],
  ],
];

const SUCKERS: readonly Point[] = [
  [11, 72],
  [89, 72],
  [26, 85],
  [74, 85],
  [33, 72],
  [67, 72],
];

const octopus: Build = {
  behind: (rank, suit) => [
    ...OCTO_ARMS.map((arm) => cut(arm, "Body")),
    ...SUCKERS.map(([x, y]) =>
      flat(
        [
          [x, y - 1.8],
          [x + 1.8, y],
          [x, y + 1.8],
          [x - 1.8, y],
        ],
        "Fin"
      )
    ),
    ...ofPart(
      turned(
        [
          cut(
            [
              [77, 37],
              [95, 37],
              [95, 61],
              [77, 61],
            ],
            "Stock"
          ),
          ...cornerIndex(rank, suit, [81.6, 41.6], 5.6),
        ],
        14,
        [86, 50]
      ),
      "rank"
    ),
  ],
  body: [cut(OCTO_HEAD, "Body")],
  brows: { half: 6.5, y: 25 },
  cheek: [68, 53],
  eyes: { left: 38, right: 62, size: 12.5, y: 37.5 },
  fold: 30,
  front: nothing,
  glasses: { height: 14, inner: 10, outer: 19, y: 35 },
  hat: { tilt: 0, width: 36, x: 50, y: 8 },
  mouth: { half: 8.5, wide: false, x: 50, y: 52 },
  neck: { left: 34, right: 66, sag: 6, y: 62 },
  outline: [OCTO_HEAD],
};

const WHALE_BODY: Polygon = [
  [9, 34],
  [20, 20],
  [80, 20],
  [91, 34],
  [91, 56],
  [77, 70],
  [23, 70],
  [9, 56],
];

const whale: Build = {
  behind: () =>
    finPair([
      [14, 55],
      [1, 67],
      [6, 73],
      [20, 64],
    ]),
  body: [
    cut(WHALE_BODY, "Body"),
    flat(
      [
        [22, 60],
        [78, 58],
        [77, 60.6],
        [23, 62.6],
      ],
      "Stock"
    ),
    flat(
      [
        [28, 65],
        [72, 63.6],
        [71, 66.2],
        [29, 67.4],
      ],
      "Stock"
    ),
  ],
  brows: { half: 6.5, y: 37.5 },
  cheek: [50, 31],
  eyes: { left: 26, right: 74, size: 9.5, y: 47 },
  fold: 38,
  front: (rank, suit) =>
    ofPart(
      turned(
        [
          cut(
            [
              [8, 13],
              [24, 13],
              [24, 33],
              [8, 33],
            ],
            "Stock"
          ),
          ...cornerIndex(rank, suit, [12.4, 17.6], 5),
        ],
        -14,
        [16, 24]
      ),
      "rank"
    ),
  glasses: { height: 13, inner: 21, outer: 18, y: 46 },
  hat: { tilt: 0, width: 50, x: 50, y: 21 },
  mouth: { half: 34, wide: true, x: 50, y: 54 },
  neck: { left: 26, right: 74, sag: 6, y: 70 },
  outline: [WHALE_BODY],
};

const HAMMER: Polygon = [
  [2, 28],
  [9, 17],
  [50, 11],
  [91, 17],
  [98, 28],
  [94, 38],
  [70, 42],
  [63, 53],
  [37, 53],
  [30, 42],
  [6, 38],
];

const HAMMER_FIN: Polygon = [
  [41, 20],
  [57, -3],
  [65, 20],
];

const hammerhead: Build = {
  behind: (rank, suit) => [
    ...finTab(rank, suit, -2),
    ...finPair([
      [24, 59],
      [7, 67],
      [12, 73],
      [28, 67],
    ]),
  ],
  body: [
    cut(
      [
        [25, 46],
        [75, 46],
        [81, 58],
        [70, 72],
        [30, 72],
        [19, 58],
      ],
      "Body"
    ),
    cut(
      [
        [25, 57],
        [75, 57],
        [69, 75],
        [31, 75],
      ],
      "Stock"
    ),
    cut(HAMMER, "Body"),
  ],
  brows: { half: 5.5, y: 20.5 },
  cheek: [72, 31],
  eyes: { left: 11, right: 89, size: 8, y: 28 },
  fold: 36,
  front: nothing,
  glasses: { height: 12, inner: 9, outer: 9, y: 27 },
  hat: { tilt: 0, width: 38, x: 50, y: 14 },
  mouth: { half: 13, wide: false, x: 50, y: 64 },
  neck: { left: 32, right: 68, sag: 7, y: 72 },
  outline: [HAMMER, HAMMER_FIN],
};

const PUFFER_BODY: Polygon = [
  [19, 38],
  [31, 21],
  [50, 15],
  [69, 21],
  [81, 38],
  [82, 55],
  [70, 70],
  [50, 76],
  [30, 70],
  [18, 55],
];

const SPIKE_ANGLES: readonly (readonly [number, number])[] = [
  [-162, 13],
  [-132, 13],
  [-104, 12],
  [-48, 13],
  [-18, 13],
  [12, 13],
  [40, 11],
  [140, 11],
  [168, 13],
];

const aroundPuffer = (degrees: number, radius: number): Point => [
  50 + radius * Math.cos((degrees * Math.PI) / 180),
  46 + radius * 0.94 * Math.sin((degrees * Math.PI) / 180),
];

const spike = (angle: number, length: number): Piece =>
  cut(
    [
      aroundPuffer(angle - 9, 28),
      aroundPuffer(angle, 30 + length),
      aroundPuffer(angle + 9, 28),
    ],
    "Fin"
  );

const puffer: Build = {
  behind: (rank, suit) => [
    ...SPIKE_ANGLES.map(([angle, length]) => spike(angle, length)),
    ...tuckedCard(rank, suit, [52, 1], 10),
  ],
  body: [
    cut(PUFFER_BODY, "Body"),
    cut(
      [
        [26, 58],
        [50, 63],
        [74, 58],
        [69, 71],
        [50, 78],
        [31, 71],
      ],
      "Stock"
    ),
  ],
  brows: { half: 6.5, y: 25 },
  cheek: [73, 49],
  eyes: { left: 36, right: 64, size: 12, y: 38 },
  fold: 33,
  front: nothing,
  glasses: { height: 15, inner: 12, outer: 18, y: 34 },
  hat: { tilt: 0, width: 38, x: 50, y: 18 },
  mouth: { half: 8, wide: false, x: 50, y: 54 },
  neck: { left: 32, right: 68, sag: 6, y: 73 },
  outline: [PUFFER_BODY],
};

const PIRANHA_HEAD: Polygon = [
  [21, 42],
  [28, 21],
  [50, 12],
  [72, 21],
  [79, 42],
  [76, 56],
  [24, 56],
];

const PIRANHA_FIN: Polygon = [
  [38, 17],
  [54, -1],
  [66, 3],
  [63, 18],
];

const tooth = (x: number, y: number, size: number): Piece =>
  cut(
    [
      [x - size * 0.5, y],
      [x + size * 0.5, y - 0.3],
      [x, y - size],
    ],
    "Stock"
  );

const piranha: Build = {
  behind: (rank, suit) => [
    cut(PIRANHA_FIN, "Fin"),
    ...tuckedCard(rank, suit, [70, 13], 14),
    cut(
      [
        [20, 56],
        [6, 51],
        [9, 61],
        [21, 66],
      ],
      "Fin"
    ),
    cut(
      [
        [80, 56],
        [94, 51],
        [91, 61],
        [79, 66],
      ],
      "Fin"
    ),
  ],
  body: [
    cut(PIRANHA_HEAD, "Body"),
    cut(
      [
        [14, 50],
        [86, 48],
        [82, 64],
        [67, 77],
        [33, 77],
        [18, 64],
      ],
      "Body"
    ),
    tooth(29, 52.6, 7),
    tooth(39.5, 52.4, 7),
    tooth(60.5, 52.2, 7),
    tooth(71, 52, 7),
  ],
  brows: { half: 7, y: 24.5 },
  cheek: [70, 43],
  eyes: { left: 37, right: 63, size: 9, y: 32 },
  fold: 33,
  front: nothing,
  glasses: { height: 13, inner: 11, outer: 19, y: 30 },
  hat: { tilt: 0, width: 36, x: 50, y: 15 },
  mouth: { half: 14, wide: false, x: 50, y: 50 },
  neck: { left: 34, right: 66, sag: 6, y: 76 },
  outline: [PIRANHA_HEAD, PIRANHA_FIN],
};

const ANGLER_BODY: Polygon = [
  [10, 44],
  [20, 24],
  [40, 15],
  [60, 15],
  [80, 24],
  [90, 44],
  [88, 60],
  [74, 72],
  [26, 72],
  [12, 60],
];

const angler: Build = {
  behind: () =>
    finPair([
      [15, 55],
      [1, 61],
      [5, 70],
      [17, 64],
    ]),
  body: [
    cut(ANGLER_BODY, "Body"),
    ...[31, 38, 45, 55, 62, 69].map((x) => tooth(x, 64, 4.6)),
  ],
  brows: { half: 6, y: 27 },
  cheek: [77, 45],
  eyes: { left: 37, right: 63, size: 8, y: 34 },
  fold: 32,
  front: (rank, suit) => [
    cut(
      [
        [46.6, 17],
        [47.6, 5],
        [55, -4.6],
        [66, -8],
        [76, -5],
        [80.2, 1.6],
        [77, 2.4],
        [73.6, -1.6],
        [65.6, -4.6],
        [57.4, -1.4],
        [51.6, 17],
      ],
      "Body"
    ),
    ...ofPart(
      turned(
        [
          cut(
            [
              [71.5, 6],
              [84.5, 6],
              [84.5, 23],
              [71.5, 23],
            ],
            "Stock"
          ),
          ...cornerIndex(rank, suit, [75.4, 10], 4.6),
        ],
        6,
        [78, 6]
      ),
      "rank"
    ),
    cut(circle([78.6, 3.6], 2.8), "Gold"),
  ],
  glasses: { height: 13, inner: 11, outer: 18, y: 31 },
  hat: { tilt: -4, width: 38, x: 44, y: 16 },
  mouth: { half: 24, wide: false, x: 50, y: 59 },
  neck: { left: 30, right: 70, sag: 6, y: 72 },
  outline: [ANGLER_BODY],
};

export const BUILDS: Readonly<Record<Species, Build>> = {
  Angler: angler,
  Goldfish: goldfish,
  GreatWhite: greatWhite,
  Hammerhead: hammerhead,
  Octopus: octopus,
  Piranha: piranha,
  Puffer: puffer,
  Whale: whale,
};
