export type Player = "Dev" | "Jonas" | "Maya" | "Priya" | "Sam";

export const PLAYERS: readonly Player[] = [
  "Sam",
  "Maya",
  "Jonas",
  "Priya",
  "Dev",
];

export type Point = readonly [x: number, y: number];

export interface Shot {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export type ShotName = "Board" | "Duel" | "River" | "Table";

export interface Line {
  readonly at: Point;
  readonly until: number;
}

export const LINE_NAMES = [
  "Clip",
  "DevFive",
  "DevHere",
  "DevKing",
  "DevNight",
  "JonasFine",
  "JonasLate",
  "JonasRematch",
  "Link",
  "MayaIn",
  "MayaNext",
  "MayaNo",
  "MayaPriya",
  "PriyaDealing",
  "PriyaSleep",
  "SamHaha",
  "SamLocked",
  "SamRules",
  "SamTonight",
  "SamUnchanged",
] as const;

export type LineName = (typeof LINE_NAMES)[number];

export interface Cut {
  readonly bets: Readonly<Record<Player, Point>>;
  readonly board: readonly Point[];
  readonly button: Point;
  readonly chance: Readonly<Record<"Jonas" | "Priya", Point>>;
  readonly closeup: Point;
  readonly dealer: Point;
  readonly deck: Point;
  readonly edge: Readonly<Record<"Bottom" | "Left" | "Right" | "Top", number>>;
  readonly headline: Point;
  readonly holes: Readonly<Record<Player, Point>>;
  readonly hover: Point;
  readonly lines: Readonly<Record<LineName, Line>>;
  readonly moment: Point;
  readonly pot: Point;
  readonly prefix: string;
  readonly rules: Point;
  readonly seats: Readonly<Record<Player, Point>>;
  readonly shots: Readonly<Record<ShotName, Shot>>;
  readonly slip: Point;
  readonly spread: number;
  readonly tabled: Readonly<Record<"Jonas" | "Priya", Point>>;
  readonly title: Point;
  readonly you: Point;
  readonly yours: Shot;
}

const shot = (focus: Point, scale: number, to: Point): Shot => ({
  scale,
  x: to[0] - focus[0] * scale,
  y: to[1] - focus[1] * scale,
});

const TABLE: Shot = { scale: 1, x: 0, y: 0 };

const PHONE_SEATS: Readonly<Record<Player, Point>> = {
  Dev: [130, -126],
  Jonas: [-130, 54],
  Maya: [-130, -126],
  Priya: [130, 54],
  Sam: [0, -212],
};

const PHONE_BOARD_Y = -26;

const PHONE_STEP = 47;

const ACT_ONE = 186;

const ACT_TWO = 468;

const ACT_THREE = 636;

const ACT_FOUR = 838;

const ACT_FIVE = 968;

export const PHONE: Cut = {
  bets: {
    Dev: [78, -82],
    Jonas: [-76, 20],
    Maya: [-78, -82],
    Priya: [76, 20],
    Sam: [0, -130],
  },
  board: [-2, -1, 0, 1, 2].map((slot) => [slot * PHONE_STEP, PHONE_BOARD_Y]),
  button: [-46, -186],
  chance: { Jonas: [-70, 22], Priya: [70, 22] },
  closeup: [0, -34],
  dealer: [-62, -224],
  deck: [0, PHONE_BOARD_Y],
  edge: { Bottom: 460, Left: -260, Right: 260, Top: -460 },
  headline: [0, -44],
  holes: {
    Dev: [84, -116],
    Jonas: [-84, 46],
    Maya: [-84, -116],
    Priya: [84, 46],
    Sam: [50, -216],
  },
  hover: [0, 66],
  lines: {
    Clip: { at: [-58, -182], until: 862 },
    DevFive: { at: [98, -150], until: 178 },
    DevHere: { at: [104, -190], until: 548 },
    DevKing: { at: [96, -196], until: 754 },
    DevNight: { at: [92, -196], until: 944 },
    JonasFine: { at: [-96, 30], until: 146 },
    JonasLate: { at: [-88, 30], until: 86 },
    JonasRematch: { at: [-78, 0], until: ACT_FIVE },
    Link: { at: [0, -62], until: 114 },
    MayaIn: { at: [-112, -150], until: 116 },
    MayaNext: { at: [-70, -196], until: 952 },
    MayaNo: { at: [-104, -196], until: 754 },
    MayaPriya: { at: [-96, -196], until: 632 },
    PriyaDealing: { at: [92, 30], until: 132 },
    PriyaSleep: { at: [84, 0], until: 962 },
    SamHaha: { at: [0, -150], until: 754 },
    SamLocked: { at: [0, -150], until: 978 },
    SamRules: { at: [0, -146], until: 222 },
    SamTonight: { at: [0, -128], until: 114 },
    SamUnchanged: { at: [76, -236], until: 394 },
  },
  moment: [0, -34],
  pot: [0, -96],
  prefix: "p",
  rules: [0, -58],
  seats: PHONE_SEATS,
  shots: {
    Board: shot([0, PHONE_BOARD_Y], 1.1, [0, PHONE_BOARD_Y]),
    Duel: shot([0, 40], 1.07, [0, 30]),
    River: shot([0, 30], 1.12, [0, 20]),
    Table: TABLE,
  },
  slip: [0, -30],
  spread: 15,
  tabled: { Jonas: [-70, 58], Priya: [70, 58] },
  title: [0, -150],
  you: [0, 152],
  yours: { scale: 2.1, x: 0, y: -40 },
};

const DESK_SEATS: Readonly<Record<Player, Point>> = {
  Dev: [350, -112],
  Jonas: [-350, 118],
  Maya: [-350, -112],
  Priya: [350, 118],
  Sam: [0, -234],
};

const DESK_STEP = 88;

const DESK_BOARD_Y = 40;

const SLOT = 58;

const THREAD_TOP = -152;

const slot = (index: number, until: number): Line => ({
  at: [0, THREAD_TOP + index * SLOT],
  until,
});

export const DESK: Cut = {
  bets: {
    Dev: [250, -58],
    Jonas: [-250, 40],
    Maya: [-250, -58],
    Priya: [250, 40],
    Sam: [-112, -150],
  },
  board: [-2, -1, 0, 1, 2].map((place) => [place * DESK_STEP, DESK_BOARD_Y]),
  button: [-92, -184],
  chance: { Jonas: [-246, 84], Priya: [246, 84] },
  closeup: [0, 24],
  dealer: [-112, -244],
  deck: [0, DESK_BOARD_Y],
  edge: { Bottom: 560, Left: -640, Right: 640, Top: -560 },
  headline: [0, 44],
  holes: {
    Dev: [258, -100],
    Jonas: [-258, 116],
    Maya: [-258, -100],
    Priya: [258, 116],
    Sam: [94, -240],
  },
  hover: [0, 176],
  lines: {
    Clip: slot(3, ACT_FIVE - 122),
    DevFive: slot(6.5, ACT_ONE),
    DevHere: slot(1, ACT_THREE),
    DevKing: slot(1, ACT_FOUR),
    DevNight: slot(0, ACT_FIVE),
    JonasFine: slot(5.6, ACT_ONE),
    JonasLate: slot(4.7, ACT_ONE),
    JonasRematch: slot(3, ACT_FIVE),
    Link: slot(1.3, ACT_ONE),
    MayaIn: slot(2.9, ACT_ONE),
    MayaNext: slot(1, ACT_FIVE),
    MayaNo: slot(0, ACT_FOUR),
    MayaPriya: slot(2, ACT_THREE),
    PriyaDealing: slot(3.8, ACT_ONE),
    PriyaSleep: slot(2, ACT_FIVE),
    SamHaha: slot(2, ACT_FOUR),
    SamLocked: slot(4, ACT_FIVE + 10),
    SamRules: slot(0, ACT_TWO - 208),
    SamTonight: slot(0, ACT_ONE),
    SamUnchanged: slot(0, ACT_TWO),
  },
  moment: [0, 26],
  pot: [0, -60],
  prefix: "d",
  rules: [0, 30],
  seats: DESK_SEATS,
  shots: {
    Board: shot([0, DESK_BOARD_Y], 1.1, [0, DESK_BOARD_Y]),
    Duel: shot([0, 100], 1.1, [0, 80]),
    River: shot([0, 100], 1.13, [0, 80]),
    Table: TABLE,
  },
  slip: [0, 26],
  spread: 27,
  tabled: { Jonas: [-218, 154], Priya: [218, 154] },
  title: [0, -196],
  you: [0, 238],
  yours: { scale: 1.45, x: 0, y: -24 },
};
