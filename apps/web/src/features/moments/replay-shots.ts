import type { Expression } from "@nostakes/avatar";
import type { SeatIndex } from "@nostakes/engine";

import { textWidth } from "../pictures/text-fit.js";
import { chipsText } from "./captions.js";
import type { Layout, Placed } from "./replay-stage.js";
import { REST } from "./timeline.js";
import type { Pose } from "./timeline.js";

export type Shot = "Board" | "CloseUp" | "TwoShot";

export interface SeatScene {
  readonly bet: number;
  readonly cards: readonly string[];
  readonly expression: Expression;
  readonly folded: boolean;
  readonly loud: boolean;
  readonly note: string;
  readonly stack: number | null;
}

export interface Chances {
  readonly lead: number;
  readonly other: number;
}

export interface Scene {
  readonly boards: readonly (readonly string[])[];
  readonly caption: readonly string[];
  readonly facing: number;
  readonly focus: SeatIndex;
  readonly odds: Chances | null;
  readonly pot: number;
  readonly seats: ReadonlyMap<SeatIndex, SeatScene>;
  readonly shot: Shot;
  readonly slammed: string;
}

export interface Person {
  readonly avatar: string;
  readonly name: string;
  readonly seat: SeatIndex;
}

export interface Cast {
  readonly lead: Person;
  readonly other: Person | null;
  readonly rest: readonly Person[];
  readonly top: number;
}

export const STAGE = { height: 1350, width: 1080 };

const MIDDLE = STAGE.width / 2;

const CAPTION = { lineGap: 1.14, room: 900, sizes: [78, 68, 58, 50], y: 196 };

const SMALLEST_CAPTION = 50;

const wrapped = (text: string, size: number): readonly string[] => {
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(" ")) {
    const longer = line.length === 0 ? word : `${line} ${word}`;

    if (line.length > 0 && textWidth(longer, size) > CAPTION.room) {
      lines.push(line);
      line = word;
    } else {
      line = longer;
    }
  }

  return [...lines, line].filter((each) => each.length > 0);
};

export const captionLines = (text: string): readonly string[] =>
  text.split("\n").flatMap((sentence) => wrapped(sentence, SMALLEST_CAPTION));

const captionSize = (lines: readonly string[]) =>
  CAPTION.sizes.find((size) =>
    lines.every((line) => textWidth(line, size) <= CAPTION.room)
  ) ?? SMALLEST_CAPTION;

const captionOf = (
  lines: readonly string[],
  top: number
): readonly (readonly [string, Placed])[] => {
  if (lines.length === 0) {
    return [];
  }

  const size = captionSize(lines);

  return [
    [
      "caption",
      {
        art: {
          kind: "Caption",
          lines,
          size,
          x: MIDDLE,
          y:
            top +
            CAPTION.y -
            ((lines.length - 1) * size * CAPTION.lineGap) / 2 +
            size * 0.3,
        },
      },
    ],
  ];
};

const label = (
  text: string,
  place: {
    readonly size: number;
    readonly tone?: "Ink" | "Muted";
    readonly weight?: "Bold" | "Heavy";
    readonly x: number;
    readonly y: number;
  }
): Placed => ({
  art: {
    kind: "Label",
    size: place.size,
    text,
    tone: place.tone ?? "Ink",
    weight: place.weight ?? "Bold",
    x: place.x,
    y: place.y,
  },
});

const face = (
  person: Person,
  expression: Expression,
  place: { readonly size: number; readonly x: number; readonly y: number },
  pose: Pose = REST
): Placed => ({
  art: {
    avatar: person.avatar,
    expression,
    kind: "Face",
    size: place.size,
    x: place.x,
    y: place.y,
  },
  pose,
});

const TURNS = [-7, 6];

const holes = (
  name: string,
  cards: readonly string[],
  place: {
    readonly spread: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  }
): readonly (readonly [string, Placed])[] =>
  cards.map((card, index) => [
    `${name}:${index}`,
    {
      art: {
        card,
        kind: "Card",
        turn: TURNS[index] ?? 0,
        width: place.width,
        x: Math.round(place.x + index * place.width * place.spread),
        y: place.y + (index === 0 ? 5 : 0),
      },
    },
  ]);

const ALL_IN = "All in";

const stackText = (seat: SeatScene) => {
  if (seat.stack === null) {
    return "";
  }

  return seat.stack === 0 ? ALL_IN : chipsText(seat.stack);
};

const pillText = (seat: SeatScene) => {
  if (seat.note.length > 0) {
    return seat.note;
  }

  if (seat.bet > 0) {
    return chipsText(seat.bet);
  }

  return stackText(seat) === ALL_IN ? ALL_IN : "";
};

const pillTone = (seat: SeatScene) =>
  seat.loud || (seat.bet === 0 && seat.note.length === 0) ? "Red" : "Paper";

const BAR = { height: 52, width: 900, x: 90 };

const barOf = (
  odds: Chances | null,
  y: number
): readonly (readonly [string, Placed])[] => {
  if (odds === null) {
    return [];
  }

  const lead = Math.max(0.004, odds.lead / 100);
  const other = Math.max(0.004, odds.other / 100);
  const box = { height: BAR.height, width: BAR.width, x: BAR.x, y };

  return [
    ["bar:track", { art: { ...box, kind: "Bar", tone: "Track" } }],
    [
      "bar:lead",
      {
        art: { ...box, kind: "Bar", tone: "Lead" },
        pose: { ...REST, dx: (-(1 - lead) * BAR.width) / 2, squeeze: lead },
      },
    ],
    [
      "bar:other",
      {
        art: { ...box, kind: "Bar", tone: "Other" },
        pose: { ...REST, dx: ((1 - other) * BAR.width) / 2, squeeze: other },
      },
    ],
    [
      "bar:lead%",
      {
        ...label(`${odds.lead}%`, {
          size: 76,
          weight: "Heavy",
          x: BAR.x + 92,
          y: y - 22,
        }),
        enter: "Stamp",
      },
    ],
    [
      "bar:other%",
      {
        ...label(`${odds.other}%`, {
          size: 76,
          weight: "Heavy",
          x: BAR.x + BAR.width - 92,
          y: y - 22,
        }),
        enter: "Stamp",
      },
    ],
  ];
};

const seatOf = (scene: Scene, person: Person): SeatScene =>
  scene.seats.get(person.seat) ?? {
    bet: 0,
    cards: [],
    expression: "Resting",
    folded: false,
    loud: false,
    note: "",
    stack: null,
  };

const DUO = {
  bet: 276,
  face: 380,
  faceY: 300,
  hole: 126,
  holeY: 590,
  left: 90,
  name: 836,
  right: 610,
};

const duoSide = (
  scene: Scene,
  person: Person,
  side: "Left" | "Right",
  top: number
): readonly (readonly [string, Placed])[] => {
  const seat = seatOf(scene, person);
  const x = side === "Left" ? DUO.left : DUO.right;
  const centre = x + DUO.face / 2;
  const tag = `seat:${person.seat}`;

  return [
    [
      `${tag}:face`,
      face(person, seat.expression, {
        size: DUO.face,
        x,
        y: top + DUO.faceY,
      }),
    ],
    ...holes(`${tag}:hole`, seat.cards, {
      spread: 0.7,
      width: DUO.hole,
      x: centre - DUO.hole * 0.85,
      y: top + DUO.holeY,
    }),
    [
      `${tag}:name`,
      label(person.name, { size: 50, x: centre, y: top + DUO.name }),
    ],
    ...(pillText(seat).length > 0
      ? ([
          [
            `${tag}:bet`,
            {
              art: {
                kind: "Pill",
                size: 38,
                text: pillText(seat),
                tone: pillTone(seat),
                x: centre,
                y: top + DUO.bet + 22,
              },
            },
          ],
        ] as const)
      : []),
  ];
};

const MINI = { face: 84, gap: 22, y: 1168 };

const restRow = (
  scene: Scene,
  cast: Cast
): readonly (readonly [string, Placed])[] => {
  const span = cast.rest.length * MINI.face + (cast.rest.length - 1) * MINI.gap;

  return cast.rest.flatMap((person, index) => {
    const seat = seatOf(scene, person);
    const x = MIDDLE - span / 2 + index * (MINI.face + MINI.gap);
    const dim = seat.folded ? { ...REST, opacity: 0.4 } : REST;
    const tag = `seat:${person.seat}`;

    return [
      [
        `${tag}:face`,
        face(
          person,
          seat.expression,
          { size: MINI.face, x, y: cast.top + MINI.y },
          dim
        ),
      ],
      [
        `${tag}:name`,
        {
          ...label(person.name, {
            size: 24,
            tone: "Muted",
            x: x + MINI.face / 2,
            y: cast.top + MINI.y + MINI.face + 28,
          }),
          pose: dim,
        },
      ],
      ...(seat.bet > 0 || seat.note.length > 0
        ? ([
            [
              `${tag}:bet`,
              {
                art: {
                  kind: "Pill",
                  size: 24,
                  text: seat.note.length > 0 ? seat.note : chipsText(seat.bet),
                  tone: seat.loud ? "Red" : "Paper",
                  x: x + MINI.face / 2,
                  y: cast.top + MINI.y - 22,
                },
              },
            ],
          ] as const)
        : []),
    ] as const;
  });
};

const potOf = (
  scene: Scene,
  y: number,
  side = false
): readonly (readonly [string, Placed])[] =>
  scene.pot > 0
    ? [
        [
          "pot",
          {
            art: {
              kind: "Pill",
              size: 40,
              text: `Pot ${chipsText(scene.pot)}`,
              tone: "Red",
              x: side ? STAGE.width - 200 : MIDDLE,
              y,
            },
          },
        ],
      ]
    : [];

const STRIP = { gap: 10, width: 72, y: 1050 };

const stripOf = (
  scene: Scene,
  top: number,
  crowded: boolean
): readonly (readonly [string, Placed])[] => {
  const [board = []] = scene.boards;
  const span = STRIP.width * 5 + STRIP.gap * 4;
  const left = crowded ? 96 : MIDDLE - span / 2;

  return scene.boards.length === 1
    ? board.map((card, index) => [
        `strip:${index}`,
        {
          art: {
            card,
            kind: "Card",
            turn: 0,
            width: STRIP.width,
            x: left + index * (STRIP.width + STRIP.gap),
            y: top + (crowded ? STRIP.y - 12 : STRIP.y + 20),
          },
        },
      ])
    : [];
};

const twoShot = (scene: Scene, cast: Cast): Layout =>
  new Map<string, Placed>([
    ...captionOf(scene.caption, cast.top),
    ...duoSide(scene, cast.lead, "Left", cast.top),
    ...(cast.other === null
      ? []
      : duoSide(scene, cast.other, "Right", cast.top)),
    ...barOf(scene.odds, cast.top + 990),
    ...stripOf(scene, cast.top, cast.rest.length > 0),
    ...restRow(scene, cast),
    ...potOf(
      scene,
      cast.top + (cast.rest.length > 0 ? 1088 : 1216),
      scene.boards.length === 1 && cast.rest.length > 0
    ),
  ]);

const ROWS = [
  { gap: 16, step: 0, width: 156 },
  { gap: 14, step: 212, width: 140 },
  { gap: 12, step: 160, width: 106 },
];

const BOARD_Y = 316;

const CARD_RATIO = 1.4;

export const boardBottom = (runs: number) => {
  const row = ROWS[Math.min(runs, ROWS.length) - 1] ?? ROWS[0];

  return row === undefined
    ? BOARD_Y
    : BOARD_Y + (runs - 1) * row.step + row.width * CARD_RATIO;
};

const boardCards = (
  scene: Scene,
  top: number
): readonly (readonly [string, Placed])[] => {
  const row = ROWS[Math.min(scene.boards.length, ROWS.length) - 1];

  if (row === undefined) {
    return [];
  }

  const span = row.width * 5 + row.gap * 4;

  return scene.boards.flatMap((board, run) =>
    board.map((card, index) => {
      const name = `board:${run}:${index}`;

      return [
        name,
        {
          art: {
            card,
            kind: "Card",
            turn: 0,
            width: row.width,
            x: MIDDLE - span / 2 + index * (row.width + row.gap),
            y: top + BOARD_Y + run * row.step,
          },
          enter: scene.slammed === name ? "Slam" : "Drop",
        },
      ] as const;
    })
  );
};

const SIDES = [
  { face: 260, hole: 104, name: 46 },
  { face: 210, hole: 88, name: 40 },
  { face: 170, hole: 74, name: 34 },
];

type Side = (typeof SIDES)[number];

const boardSide = (
  scene: Scene,
  person: Person,
  place: {
    readonly side: "Left" | "Right";
    readonly size: Side;
    readonly y: number;
  }
): readonly (readonly [string, Placed])[] => {
  const seat = seatOf(scene, person);
  const { face: size, hole, name } = place.size;
  const x = place.side === "Left" ? 90 : STAGE.width - 90 - size;
  const tag = `seat:${person.seat}`;

  return [
    [`${tag}:face`, face(person, seat.expression, { size, x, y: place.y })],
    [
      `${tag}:name`,
      label(person.name, {
        size: name,
        x: x + size / 2,
        y: place.y + size + name * 1.2,
      }),
    ],
    ...holes(`${tag}:hole`, seat.cards, {
      spread: 0.66,
      width: hole,
      x: place.side === "Left" ? x + size + 16 : x - 16 - hole * 1.66,
      y: place.y + size - hole * CARD_RATIO - 8,
    }),
  ];
};

const boardShot = (scene: Scene, cast: Cast): Layout => {
  const runs = scene.boards.length;
  const size = SIDES[Math.min(runs, SIDES.length) - 1] ?? SIDES[0];
  const below = cast.top + boardBottom(runs);
  const bar = below + (scene.odds === null ? 0 : 124);
  const sides = bar + (scene.odds === null ? 70 : BAR.height + 50);

  return size === undefined
    ? new Map()
    : new Map<string, Placed>([
        ...captionOf(scene.caption, cast.top),
        ...boardCards(scene, cast.top),
        ...barOf(scene.odds, bar),
        ...boardSide(scene, cast.lead, { side: "Left", size, y: sides }),
        ...(cast.other === null
          ? []
          : boardSide(scene, cast.other, { side: "Right", size, y: sides })),
        ...potOf(scene, sides + size.face * 0.3),
      ]);
};

const CLOSE = { face: 640, hole: 164, y: 300 };

const closeUp = (scene: Scene, cast: Cast): Layout => {
  const person =
    [cast.lead, cast.other, ...cast.rest].find(
      (each) => each !== null && each.seat === scene.focus
    ) ?? cast.lead;

  const seat = seatOf(scene, person);
  const x = MIDDLE - CLOSE.face / 2;
  const y = cast.top + CLOSE.y;

  return new Map<string, Placed>([
    ...captionOf(scene.caption, cast.top),
    ["close:face", face(person, seat.expression, { size: CLOSE.face, x, y })],
    [
      "close:name",
      label(person.name, {
        size: 72,
        weight: "Heavy",
        x: MIDDLE,
        y: y + CLOSE.face + 92,
      }),
    ],
    ...holes(`close:hole`, seat.cards, {
      spread: 0.62,
      width: CLOSE.hole,
      x: x + CLOSE.face - CLOSE.hole * 1.25,
      y: y + CLOSE.face - CLOSE.hole * CARD_RATIO * 0.86,
    }),
    ...(scene.facing > 0
      ? ([
          [
            "close:facing",
            {
              art: {
                kind: "Pill",
                size: 44,
                text: `${chipsText(scene.facing)} to call`,
                tone: "Red",
                x: x + 150,
                y: y + CLOSE.face - 40,
              },
            },
          ],
        ] as const)
      : []),
  ]);
};

export const layoutOf = (scene: Scene, cast: Cast): Layout => {
  if (scene.shot === "Board") {
    return boardShot(scene, cast);
  }

  return scene.shot === "CloseUp" ? closeUp(scene, cast) : twoShot(scene, cast);
};
