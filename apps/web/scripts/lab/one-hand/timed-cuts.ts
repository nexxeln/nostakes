import { DESK, PHONE } from "./cuts.js";
import type { Cut, LineName, Point, Shot } from "./cuts.js";

const shot = (focus: Point, scale: number, to: Point): Shot => ({
  scale,
  x: to[0] - focus[0] * scale,
  y: to[1] - focus[1] * scale,
});

const TABLE: Shot = { scale: 1, x: 0, y: 0 };

const spoken = (
  base: Cut["lines"],
  spots: Partial<Record<LineName, Point>>
): Cut["lines"] => ({
  ...base,
  ...Object.fromEntries(
    Object.entries(spots).map(([name, at]) => [name, { at, until: 0 }])
  ),
});

const PHONE_BOARD_Y = 14;

const PHONE_STEP = 47;

export const TIMED_PHONE: Cut = {
  ...PHONE,
  bets: {
    Dev: [78, -36],
    Jonas: [-70, 52],
    Maya: [-78, -36],
    Priya: [70, 52],
    Sam: [0, -78],
  },
  board: [-2, -1, 0, 1, 2].map((slot) => [slot * PHONE_STEP, PHONE_BOARD_Y]),
  button: [-46, -136],
  chance: { Jonas: [-70, 60], Priya: [70, 60] },
  closeup: [0, 2],
  dealer: [-60, -172],
  deck: [0, PHONE_BOARD_Y],
  edge: { Bottom: 300, Left: -260, Right: 260, Top: -300 },
  holes: {
    Dev: [84, -76],
    Jonas: [-84, 76],
    Maya: [-84, -76],
    Priya: [84, 76],
    Sam: [50, -162],
  },
  hover: [0, 96],
  lines: spoken(PHONE.lines, {
    Clip: [-96, -150],
    DevFive: [100, -134],
    DevHere: [100, -134],
    DevKing: [92, -134],
    JonasFine: [-96, 30],
    JonasLate: [-84, 30],
    JonasRematch: [-78, 30],
    Link: [0, -36],
    MayaIn: [-104, -134],
    MayaNo: [-104, -134],
    PriyaDealing: [88, 30],
    SamLocked: [78, -178],
    SamTonight: [84, -178],
    SamUnchanged: [80, -178],
  }),
  moment: [0, 6],
  pot: [0, -52],
  seats: {
    Dev: [130, -84],
    Jonas: [-130, 82],
    Maya: [-130, -84],
    Priya: [130, 82],
    Sam: [0, -158],
  },
  shots: {
    Board: shot([0, PHONE_BOARD_Y], 1.06, [0, PHONE_BOARD_Y]),
    Duel: shot([0, 60], 1.06, [0, 52]),
    River: shot([0, 60], 1.08, [0, 50]),
    Table: TABLE,
  },
  slip: [0, 6],
  tabled: { Jonas: [-70, 88], Priya: [70, 88] },
  title: [0, -128],
  you: [0, 170],
  yours: { scale: 1.85, x: 0, y: -14 },
};

const DESK_BOARD_Y = 22;

const DESK_STEP = 88;

export const TIMED_DESK: Cut = {
  ...DESK,
  bets: {
    Dev: [250, -66],
    Jonas: [-250, 30],
    Maya: [-250, -66],
    Priya: [250, 30],
    Sam: [-118, -150],
  },
  board: [-2, -1, 0, 1, 2].map((slot) => [slot * DESK_STEP, DESK_BOARD_Y]),
  button: [-96, -204],
  chance: { Jonas: [-246, 90], Priya: [246, 90] },
  closeup: [0, -4],
  dealer: [-116, -262],
  deck: [0, DESK_BOARD_Y],
  edge: { Bottom: 460, Left: -600, Right: 600, Top: -460 },
  holes: {
    Dev: [258, -112],
    Jonas: [-258, 94],
    Maya: [-258, -112],
    Priya: [258, 94],
    Sam: [94, -256],
  },
  hover: [0, 150],
  lines: spoken(DESK.lines, {
    Clip: [-236, -214],
    DevFive: [236, -200],
    DevHere: [236, -200],
    DevKing: [220, -200],
    JonasFine: [-240, 22],
    JonasLate: [-232, 22],
    JonasRematch: [-224, 22],
    Link: [0, 4],
    MayaIn: [-236, -200],
    MayaNo: [-236, -200],
    PriyaDealing: [232, 22],
    SamLocked: [176, -274],
    SamTonight: [170, -274],
    SamUnchanged: [200, -274],
  }),
  moment: [0, -20],
  pot: [0, -78],
  seats: {
    Dev: [350, -124],
    Jonas: [-350, 96],
    Maya: [-350, -124],
    Priya: [350, 96],
    Sam: [0, -252],
  },
  shots: {
    Board: shot([0, DESK_BOARD_Y], 1.06, [0, DESK_BOARD_Y]),
    Duel: shot([0, 90], 1.08, [0, 74]),
    River: shot([0, 90], 1.1, [0, 74]),
    Table: TABLE,
  },
  slip: [0, -20],
  tabled: { Jonas: [-218, 130], Priya: [218, 130] },
  title: [0, -190],
  you: [0, 208],
  yours: { scale: 1.4, x: 0, y: -30 },
};
