import type { Expression } from "@nostakes/avatar";

import { CLOSEUP_SHEETS } from "./art.js";
import {
  ROLES,
  SCRAPS,
  actorId,
  emptyId,
  holeId,
  lineId,
  scrapId,
} from "./cast.js";
import { PLAYERS } from "./cuts.js";
import type { Cut, LineName, Player, Point, ShotName } from "./cuts.js";
import { SHADOW, at, between, directorOf, lifted, plus } from "./direction.js";
import type { Director } from "./direction.js";
import { ROOT, emptyFilm } from "./engine.js";
import type { Ease, Film } from "./engine.js";

export const TIMED_LENGTH = 21_000;

const PACE = 22;

const SEAL = 3100;

const DEAL = 3800;

const PREFLOP = 4500;

const FLOP = 5300;

const MAYA = 6000;

const BETS = 7600;

const TURN = 8550;

const UP = 10_100;

const RIVER = 11_200;

const LAND = 13_300;

const MOMENT = 14_600;

const KEPT = 16_050;

const CLEAR = 16_500;

const SLIP = 16_700;

const SLIP_OUT = 18_500;

const YOURS = 19_700;

export const TIMED_MOMENT = { for: 950, from: MOMENT };

export const TIMED_PRINT = { from: SLIP + 150, step: 128, steps: 7 };

export const TIMED_STILL = PREFLOP - 20;

export const TIMED_ACTS: readonly {
  readonly from: number;
  readonly id: string;
  readonly name: string;
  readonly to: number;
}[] = [
  { from: 0, id: "act-deal", name: "The deal", to: FLOP },
  { from: FLOP, id: "act-flop", name: "The flop", to: TURN },
  { from: TURN, id: "act-turn", name: "The turn", to: RIVER },
  { from: RIVER, id: "act-river", name: "The river", to: CLEAR },
  { from: CLEAR, id: "act-settle", name: "Settle up", to: TIMED_LENGTH },
];

export const TIMED_BEATS = [
  0,
  1000,
  SEAL - 20,
  PREFLOP - 20,
  MAYA - 50,
  MAYA + 450,
  TURN - 50,
  UP - 50,
  RIVER - 100,
  RIVER + 1300,
  MOMENT - 100,
  KEPT - 150,
  SLIP_OUT - 200,
  YOURS - 50,
  TIMED_LENGTH,
];

export const TIMED_CAPTIONS: readonly {
  readonly from: number;
  readonly id: string;
  readonly lines: readonly string[];
  readonly to: number;
}[] = [
  {
    from: 0,
    id: "tcap-link",
    lines: ["9:02 pm, Toronto.", "Sam drops a link in the group chat."],
    to: 1500,
  },
  {
    from: 1650,
    id: "tcap-zones",
    lines: ["Five friends, four time zones.", "Nobody downloaded anything."],
    to: SEAL + 50,
  },
  {
    from: SEAL + 200,
    id: "tcap-seal",
    lines: ["The deck is sealed before the deal.", "Every phone checks it."],
    to: FLOP + 400,
  },
  {
    from: MAYA + 150,
    id: "tcap-peek",
    lines: ["Hold your cards to peek.", "Maya has looked three times."],
    to: BETS - 100,
  },
  {
    from: BETS + 100,
    id: "tcap-play",
    lines: ["Drag a chip to raise.", "Flick your cards away to fold."],
    to: UP - 200,
  },
  {
    from: UP + 150,
    id: "tcap-odds",
    lines: ["All in, cards up.", "The table does the math."],
    to: RIVER + 300,
  },
  {
    from: MOMENT + 150,
    id: "tcap-moment",
    lines: ["The table calls the hand.", "Keep the picture, or the clip."],
    to: KEPT + 400,
  },
  {
    from: SLIP + 200,
    id: "tcap-settle",
    lines: ["Who pays whom.", "It keeps the count, never the money."],
    to: SLIP_OUT + 100,
  },
  {
    from: YOURS + 350,
    id: "tcap-end",
    lines: ["Seats nine.", "This one is yours."],
    to: TIMED_LENGTH + 1,
  },
];

export const TIMED_RIVER_CAPTION = {
  from: RIVER + 500,
  id: "tcap-river",
  to: LAND + 50,
};

export const TIMED_LINES: readonly {
  readonly from: number;
  readonly name: LineName;
  readonly to: number;
}[] = [
  { from: 300, name: "SamTonight", to: 1900 },
  { from: 550, name: "Link", to: 1900 },
  { from: 850, name: "MayaIn", to: 1250 },
  { from: 1200, name: "JonasLate", to: 1600 },
  { from: 1300, name: "PriyaDealing", to: 1750 },
  { from: 1650, name: "JonasFine", to: 2000 },
  { from: 1950, name: "DevFive", to: 2600 },
  { from: MAYA + 730, name: "SamUnchanged", to: MAYA + 1550 },
  { from: TURN + 700, name: "DevHere", to: TURN + 1500 },
  { from: LAND + 500, name: "MayaNo", to: LAND + 1350 },
  { from: LAND + 850, name: "DevKing", to: LAND + 1450 },
  { from: KEPT + 150, name: "Clip", to: KEPT + 900 },
  { from: SLIP_OUT - 50, name: "JonasRematch", to: SLIP_OUT + 750 },
  { from: SLIP_OUT + 450, name: "SamLocked", to: SLIP_OUT + 900 },
];

const TIMED_BETS: readonly {
  readonly gathered: number;
  readonly id: string;
  readonly out: number;
  readonly who: Player;
}[] = [
  { gathered: 5080, id: "bet-priya-pre", out: PREFLOP + 100, who: "Priya" },
  { gathered: 5100, id: "bet-sam-pre", out: PREFLOP + 190, who: "Sam" },
  { gathered: 5120, id: "bet-maya-pre", out: PREFLOP + 280, who: "Maya" },
  { gathered: 5140, id: "bet-jonas-pre", out: PREFLOP + 370, who: "Jonas" },
  { gathered: 8380, id: "bet-priya-flop", out: BETS + 250, who: "Priya" },
  { gathered: 8400, id: "bet-jonas-flop", out: BETS + 630, who: "Jonas" },
  { gathered: 9860, id: "bet-priya-turn", out: TURN + 600, who: "Priya" },
  { gathered: 9880, id: "bet-jonas-turn", out: TURN + 1070, who: "Jonas" },
];

const HOLE_SMALL = 0.56;

const ARRIVALS: Readonly<
  Record<
    Exclude<Player, "Sam">,
    {
      readonly ease: Ease;
      readonly from: number;
      readonly origin: (cut: Cut, seat: Point) => Point;
      readonly to: number;
      readonly turn: number;
    }
  >
> = {
  Dev: {
    ease: "Back",
    from: 2600,
    origin: (frame, seat) => [frame.edge.Right, seat[1] - 60],
    to: 3000,
    turn: 50,
  },
  Jonas: {
    ease: "InOut",
    from: 1900,
    origin: (frame, seat) => [frame.edge.Left, seat[1]],
    to: 2300,
    turn: 0,
  },
  Maya: {
    ease: "Back",
    from: 1100,
    origin: (frame, seat) => [seat[0], frame.edge.Top],
    to: 1450,
    turn: -14,
  },
  Priya: {
    ease: "Back",
    from: 1650,
    origin: (frame, seat) => [seat[0], frame.edge.Bottom],
    to: 2000,
    turn: 20,
  },
};

const DEPARTURES: Readonly<
  Record<
    Player,
    {
      readonly from: number;
      readonly target: (cut: Cut, seat: Point) => Point;
      readonly turn: number;
    }
  >
> = {
  Dev: {
    from: SLIP_OUT + 200,
    target: (frame, seat) => [frame.edge.Right, seat[1] + 40],
    turn: 30,
  },
  Jonas: {
    from: SLIP_OUT + 750,
    target: (frame, seat) => [frame.edge.Left, seat[1]],
    turn: -6,
  },
  Maya: {
    from: SLIP_OUT + 330,
    target: (frame, seat) => [seat[0], frame.edge.Top],
    turn: -12,
  },
  Priya: {
    from: SLIP_OUT + 460,
    target: (frame, seat) => [seat[0], frame.edge.Bottom],
    turn: 16,
  },
  Sam: {
    from: SLIP_OUT + 900,
    target: (frame, seat) => [seat[0], frame.edge.Top],
    turn: 8,
  },
};

const LEAVING = 280;

const DEAL_ORDER: readonly Player[] = ["Maya", "Jonas", "Priya", "Dev", "Sam"];

const SHOT_TIMES: readonly (readonly [number, number, ShotName])[] = [
  [FLOP, FLOP + 250, "Board"],
  [FLOP + 650, FLOP + 850, "Table"],
  [UP, UP + 400, "Duel"],
  [RIVER, RIVER + 400, "River"],
  [LAND + 500, LAND + 850, "Table"],
];

const BACK_DEPTH = 0.82;

const camera = ({ frame, go, starts }: Director) => {
  starts("world", ROOT, {});
  starts("back", ROOT, {});

  for (const [from, to, name] of SHOT_TIMES) {
    const { scale, x, y } = frame.shots[name];

    go("world", ROOT, [from, to, "InOut"], { scale, x, y });
    go("back", ROOT, [from, to, "InOut"], {
      scale: 1 + (scale - 1) * BACK_DEPTH,
      x: x * BACK_DEPTH,
      y: y * BACK_DEPTH,
    });
  }

  for (const [index, dx] of [5, -5, 4, -3, 0].entries()) {
    const shake = LAND + 230 + index * 45;

    go("world", ROOT, [shake, shake + 45, "Linear"], {
      x: frame.shots.River.x + dx,
    });
  }
};

const seats = ({ frame, go, starts }: Director) => {
  starts(actorId("Sam"), ROOT, at(frame.seats.Sam));
  starts("you", ROOT, at(frame.you));
  starts("you", "glow", { opacity: 0 });
  starts("felt", ROOT, {});

  for (const player of PLAYERS) {
    const id = emptyId(player);
    const gone = DEPARTURES[player].from + LEAVING;

    starts(id, ROOT, {
      ...at(frame.seats[player]),
      opacity: player === "Sam" ? 0 : 1,
    });

    if (player !== "Sam") {
      const arrival = ARRIVALS[player];

      go(id, ROOT, [arrival.to - 130, arrival.to - 20, "In"], {
        opacity: 0,
        scale: 0.9,
      });
    }

    go(id, ROOT, [gone, gone + 180, "Out"], { opacity: 1, scale: 1 });
  }
};

const seated = (
  { frame, go, set, starts }: Director,
  player: Exclude<Player, "Sam">
) => {
  const id = actorId(player);
  const seat = frame.seats[player];
  const arrival = ARRIVALS[player];

  starts(id, ROOT, {
    ...at(arrival.origin(frame, seat)),
    opacity: 0,
    scale: 1.35,
    turn: arrival.turn,
  });
  starts(id, "sh", lifted(16));
  set(id, ROOT, arrival.from, { opacity: 1 });
  go(id, ROOT, [arrival.from, arrival.to, arrival.ease], {
    ...at(seat),
    scale: 1,
    turn: 0,
  });
  go(id, "sh", [arrival.from, arrival.to, "In"], SHADOW);
};

const cast = (director: Director) => {
  const { express, frame, go, set, starts } = director;

  for (const player of PLAYERS) {
    const id = actorId(player);
    const role = ROLES[player];

    for (const expression of role.expressions) {
      starts(id, `ex-${expression}`, {
        opacity: expression === "Resting" ? 1 : 0,
      });
    }

    for (const index of role.acts.keys()) {
      starts(id, `act-${index}`, { opacity: 0 });
    }

    starts(id, "ring", { opacity: 0 });
    starts(id, "ok", { opacity: 0, scale: 0.6 });
    starts(id, "tab", { opacity: 0, scale: 0.6 });
    starts(id, "place", { opacity: 1 });
    starts(id, "city", { opacity: 0 });
    starts(id, "sh", SHADOW);
    starts(id, "tile", {});
    set(id, "place", DEAL, { opacity: 0 });
    set(id, "city", DEAL, { opacity: 1 });

    const okAt = SEAL + 350 + PLAYERS.indexOf(player) * 40;

    go(id, "ok", [okAt, okAt + 110, "Back"], { opacity: 1, scale: 1 });
    go(id, "ok", [DEAL + 350, DEAL + 450, "In"], { opacity: 0, scale: 0.6 });

    if (player !== "Sam") {
      seated(director, player);
    }

    const leaving = DEPARTURES[player];

    go(id, "sh", [leaving.from - 90, leaving.from + 40, "Out"], lifted(12));
    go(id, ROOT, [leaving.from, leaving.from + LEAVING, "In"], {
      ...at(leaving.target(frame, frame.seats[player])),
      scale: 1.25,
      turn: leaving.turn,
    });
    set(id, ROOT, leaving.from + LEAVING, { opacity: 0 });
  }

  express("Dev", ARRIVALS.Dev.from, "Folded");
  express("Dev", ARRIVALS.Dev.to + 150, "Resting");
  express("Sam", 300, "Happy");
  express("Sam", 1000, "Resting");
};

const talk = ({ frame, go, starts }: Director) => {
  for (const { from, name, to } of TIMED_LINES) {
    const id = lineId(name);
    const spot = frame.lines[name].at;

    starts(id, ROOT, {
      ...at(plus(spot, 0, frame.spread * 0.8)),
      opacity: 0,
      scale: 0.7,
      turn: -4,
    });
    go(id, ROOT, [from, from + 130, "Back"], {
      ...at(spot),
      opacity: 1,
      scale: 1,
      turn: ((from / 50) % 5) - 2,
    });
    go(id, ROOT, [from + 130, from + 175, "Linear"], { turn: 3 });
    go(id, ROOT, [from + 175, from + 220, "Linear"], { turn: -2 });
    go(id, ROOT, [from + 220, from + 265, "Linear"], { turn: 0 });
    go(id, ROOT, [to, to + 130, "In"], {
      opacity: 0,
      scale: 0.8,
      y: spot[1] - frame.spread * 0.6,
    });
  }
};

const deal = ({ frame, go, set, starts }: Director) => {
  starts("deck", ROOT, {
    ...at(plus(frame.deck, 0, -frame.spread * 6)),
    opacity: 0,
    scale: 1.3,
    turn: -8,
  });
  starts("deck", "band", { opacity: 0, scale: 1.8, turn: -8 });
  starts("deck", "sh", lifted(10));
  go("deck", ROOT, [SEAL, SEAL + 220, "Back"], {
    ...at(frame.deck),
    opacity: 1,
    scale: 1,
    turn: 0,
  });
  go("deck", "sh", [SEAL, SEAL + 220, "In"], SHADOW);
  go("deck", "band", [SEAL + 240, SEAL + 380, "Back"], {
    opacity: 1,
    scale: 1,
  });
  go("deck", "band", [DEAL - 50, DEAL + 40, "In"], { opacity: 0, scale: 1.3 });
  go("deck", ROOT, [DEAL + 650, DEAL + 850, "InOut"], {
    ...at(frame.dealer),
    scale: 0.8,
    turn: -6,
  });
  go("deck", ROOT, [CLEAR, CLEAR + 180, "In"], {
    opacity: 0,
    y: frame.edge.Top,
  });
  starts("button", ROOT, { ...at(frame.button), opacity: 0, scale: 0.4 });
  go("button", ROOT, [DEAL - 100, DEAL + 50, "Back"], { opacity: 1, scale: 1 });
  go("button", ROOT, [CLEAR, CLEAR + 150, "In"], { opacity: 0, scale: 0.4 });

  for (const [order, player] of DEAL_ORDER.entries()) {
    for (const index of [0, 1]) {
      const id = holeId(player, index);
      const dealt = DEAL + (order + index * DEAL_ORDER.length) * 45;
      const side = index === 0 ? -1 : 1;

      starts(id, ROOT, {
        ...at(frame.deck),
        opacity: 0,
        scale: player === "Jonas" || player === "Priya" ? HOLE_SMALL : 1,
        turn: 40,
      });
      starts(id, "sh", SHADOW);
      starts(id, "bk", { opacity: 1 });
      starts(id, "fc", { opacity: 0 });
      set(id, ROOT, dealt, { opacity: 1 });
      go(id, ROOT, [dealt, dealt + 240, "Out"], {
        ...at(plus(frame.holes[player], side * frame.spread * 0.3, index)),
        turn: side * 7,
      });
    }
  }
};

const POT_GROWS: readonly (readonly [number, number])[] = [
  [8500, 1],
  [10_000, 2],
];

const betting = ({ frame, go, set, starts }: Director) => {
  for (const bet of TIMED_BETS) {
    const spot = frame.bets[bet.who];

    starts(bet.id, ROOT, {
      ...at(between(frame.seats[bet.who], spot, 0.2)),
      opacity: 0,
      scale: 0.6,
    });
    go(bet.id, ROOT, [bet.out, bet.out + 130, "Out"], {
      ...at(spot),
      opacity: 1,
      scale: 1,
    });
    go(bet.id, ROOT, [bet.gathered, bet.gathered + 160, "InOut"], {
      ...at(frame.pot),
      scale: 0.7,
    });
    go(bet.id, ROOT, [bet.gathered + 90, bet.gathered + 160, "Linear"], {
      opacity: 0,
    });
  }

  starts("pot", ROOT, { ...at(frame.pot), opacity: 0, scale: 0.6 });
  starts("pot", "v-0", { opacity: 1 });
  starts("pot", "v-1", { opacity: 0 });
  starts("pot", "v-2", { opacity: 0 });
  go("pot", ROOT, [5200, 5330, "Back"], { opacity: 1, scale: 1 });

  for (const [when, value] of POT_GROWS) {
    set("pot", `v-${value - 1}`, when, { opacity: 0 });
    set("pot", `v-${value}`, when, { opacity: 1 });
    go("pot", ROOT, [when - 40, when + 20, "Out"], { scale: 1.2 });
    go("pot", ROOT, [when + 20, when + 150, "Back"], { scale: 1 });
  }

  go("pot", ROOT, [LAND + 650, LAND + 920, "InOut"], {
    ...at(plus(frame.seats.Priya, 0, -frame.spread)),
    scale: 0.8,
  });
  go("pot", ROOT, [LAND + 850, LAND + 940, "Linear"], { opacity: 0 });
};

const board = ({ flip, frame, go, set, starts }: Director) => {
  for (const [index, slot] of frame.board.slice(0, 4).entries()) {
    const id = `b-${index}`;
    const out = index < 3 ? FLOP + index * 70 : TURN;
    const turned = index < 3 ? FLOP + 240 + index * 100 : TURN + 200;

    starts(id, ROOT, {
      ...at(frame.dealer),
      opacity: 0,
      scale: 0.5,
      turn: -30,
    });
    starts(id, "sh", SHADOW);
    starts(id, "bk", { opacity: 1 });
    starts(id, "fc", { opacity: 0 });
    set(id, ROOT, out, { opacity: 1 });
    go(id, ROOT, [out, out + 200, "Out"], { ...at(slot), scale: 1, turn: 0 });
    flip(id, turned, turned + 175);
    go(id, ROOT, [CLEAR + index * 20, CLEAR + 180 + index * 20, "In"], {
      ...at(frame.dealer),
      opacity: 0,
      scale: 0.5,
    });
  }
};

const PEEKS: readonly (readonly [number, Expression])[] = [
  [MAYA + 400, "LookingDown"],
  [MAYA + 600, "Resting"],
  [MAYA + 730, "LookingDown"],
  [MAYA + 930, "Resting"],
  [MAYA + 1060, "LookingDown"],
  [MAYA + 1260, "Resting"],
];

const closeup = ({ express, frame, go, set, starts }: Director) => {
  const id = "closeup-maya";
  const leaves = MAYA + 1330;

  const away = {
    scale: 0.86,
    turn: -13,
    x: frame.edge.Left * 1.4,
    y: frame.closeup[1] + frame.spread * 2,
  };

  starts(id, ROOT, { ...away, opacity: 0 });
  starts(id, "sh", lifted(18));
  set(id, ROOT, MAYA, { opacity: 1 });
  go(id, ROOT, [MAYA, MAYA + 300, "Out"], {
    ...at(frame.closeup),
    scale: 1,
    turn: 2,
  });
  go(id, "sh", [MAYA + 90, MAYA + 350, "In"], lifted(5));
  go(id, "sh", [leaves - 40, leaves + 90, "Out"], lifted(18));
  go(id, ROOT, [leaves, leaves + 250, "In"], away);
  set(id, ROOT, leaves + 250, { opacity: 0 });

  for (let sheet = 1; sheet < CLOSEUP_SHEETS; sheet += 1) {
    const apart = { x: -sheet * 1.5, y: -sheet * 2.6 };

    starts(id, `ly-${sheet}`, apart);
    go(id, `ly-${sheet}`, [MAYA + 130, MAYA + 400, "Out"], { x: 0, y: 0 });
    go(id, `ly-${sheet}`, [leaves - 90, leaves + 90, "In"], apart);
  }

  starts(id, "st-Resting", { opacity: 1 });
  starts(id, "st-LookingDown", { opacity: 0 });

  for (const [when, expression] of PEEKS) {
    const looking = expression === "LookingDown";

    express("Maya", when, expression);
    set(id, "st-Resting", when, { opacity: looking ? 0 : 1 });
    set(id, "st-LookingDown", when, { opacity: looking ? 1 : 0 });
  }
};

const streets = ({ acts, clock, express, folds }: Director) => {
  folds("Dev", PREFLOP, 0);
  acts("Priya", 0, PREFLOP + 100, 5250);
  acts("Sam", 0, PREFLOP + 190, 5250);
  acts("Maya", 0, PREFLOP + 280, 5250);
  acts("Jonas", 0, PREFLOP + 370, 5250);
  folds("Maya", BETS, 1);
  express("Priya", BETS + 100, "Thinking");
  express("Priya", BETS + 250, "Resting");
  acts("Priya", 1, BETS + 250, BETS + 850);
  folds("Sam", BETS + 380, 1);
  express("Jonas", BETS + 530, "Thinking");
  express("Jonas", BETS + 630, "Resting");
  acts("Jonas", 1, BETS + 630, BETS + 850);
  express("Priya", TURN + 450, "Thinking");
  express("Priya", TURN + 600, "Resting");
  acts("Priya", 2, TURN + 600, LAND + 80);
  clock(actorId("Jonas"), TURN + 850, TURN + 2450, TURN + 1070);
  express("Jonas", TURN + 850, "Thinking");
  express("Jonas", TURN + 1070, "Resting");
  acts("Jonas", 2, TURN + 1070, LAND + 80);
};

const DUEL = [
  ["Jonas", UP],
  ["Priya", UP + 180],
] as const;

const showdown = ({ express, flip, frame, go, starts }: Director) => {
  for (const [who, shown] of DUEL) {
    for (const index of [0, 1]) {
      const id = holeId(who, index);
      const side = index === 0 ? -1 : 1;
      const when = shown + index * 60;

      go(id, ROOT, [when, when + 180, "Out"], {
        ...at(plus(frame.tabled[who], side * frame.spread, index * 2)),
        scale: 1,
        turn: side * 5,
      });
      flip(id, when + 100, when + 280);
      go(id, ROOT, [CLEAR, CLEAR + 180, "In"], {
        ...at(frame.dealer),
        opacity: 0,
        scale: 0.4,
      });
    }

    const tag = `chance-${who.toLowerCase()}`;

    starts(tag, ROOT, { ...at(frame.chance[who]), opacity: 0, scale: 1.6 });
    go(tag, ROOT, [UP + 580, UP + 710, "Back"], { opacity: 1, scale: 1 });
    go(tag, ROOT, [LAND + 260, LAND + 350, "In"], { opacity: 0, scale: 0.6 });
  }

  express("Jonas", UP + 620, "Happy");
  express("Priya", UP + 670, "Gutted");

  for (const player of ["Sam", "Maya", "Dev"] as const) {
    go(actorId(player), "tile", [UP + 50, UP + 250, "Out"], { opacity: 0.5 });
    go(actorId(player), "tile", [LAND + 300, LAND + 450, "Out"], {
      opacity: 1,
    });
  }
};

const river = ({ flip, frame, go, set, starts }: Director) => {
  const slot = frame.board.at(4) ?? frame.deck;

  starts("river", ROOT, {
    ...at(frame.dealer),
    opacity: 0,
    scale: 0.5,
    turn: -30,
  });
  starts("river", "sh", SHADOW);
  starts("river", "bk", { opacity: 1 });
  starts("river", "fc", { opacity: 0 });
  starts("river", "peek", { scale: 0 });
  starts("river", "hold", { opacity: 0, scale: 0.6 });
  set("river", ROOT, RIVER, { opacity: 1 });
  go("river", ROOT, [RIVER, RIVER + 600, "InOut"], {
    ...at(frame.hover),
    scale: 1.7,
    turn: -8,
  });
  go("river", "sh", [RIVER, RIVER + 600, "InOut"], lifted(13));
  set("river", "peek", RIVER + 450, { scale: 1 });
  set("river", "peek", LAND - 20, { scale: 0 });
  go("river", "hold", [RIVER + 600, RIVER + 760, "Back"], {
    opacity: 1,
    scale: 1,
  });
  go("river", "hold", [LAND - 150, LAND - 40, "In"], {
    opacity: 0,
    scale: 0.6,
  });
  go("river", ROOT, [RIVER + 600, LAND - 30, "Linear"], {
    ...at(plus(frame.hover, 0, -frame.spread * 0.5)),
    scale: 1.8,
    turn: 4,
  });
  go("river", ROOT, [LAND, LAND + 260, "In"], {
    ...at(slot),
    scale: 1,
    turn: 0,
  });
  flip("river", LAND, LAND + 220);
  go("river", "sh", [LAND + 220, LAND + 300, "In"], SHADOW);
  go("river", ROOT, [LAND + 350, LAND + 480, "Back"], {
    y: slot[1] - frame.spread * 0.5,
  });
  go("river", ROOT, [CLEAR + 40, CLEAR + 220, "In"], {
    ...at(frame.dealer),
    opacity: 0,
    scale: 0.5,
  });

  for (const index of [0, 1]) {
    const pops = LAND + 370 + index * 25;

    go(holeId("Priya", index), ROOT, [pops, pops + 130, "Back"], {
      y: frame.tabled.Priya[1] - frame.spread * 0.6,
    });
  }
};

const aftermath = ({ express, frame, go, set, starts }: Director) => {
  express("Jonas", LAND + 350, "Gutted");
  express("Priya", LAND + 350, "Happy");
  express("Sam", LAND + 450, "Happy");
  express("Maya", LAND + 450, "Happy");
  express("Dev", LAND + 450, "Resting");
  go(actorId("Priya"), "tab", [LAND + 940, LAND + 1120, "Back"], {
    opacity: 1,
    scale: 1,
  });
  go(actorId("Priya"), "tab", [CLEAR, CLEAR + 130, "In"], {
    opacity: 0,
    scale: 0.6,
  });
  express("Sam", CLEAR + 50, "Resting");
  express("Maya", CLEAR + 50, "Resting");
  express("Dev", SLIP_OUT + 100, "Folded");

  for (let index = 0; index < SCRAPS; index += 1) {
    const id = scrapId(index);
    const column = ((index * 37) % SCRAPS) / (SCRAPS - 1) - 0.5;
    const from = LAND + 300 + ((index * 5) % 9) * 45;
    const x = column * (frame.edge.Right - frame.edge.Left) * 0.62;

    starts(id, ROOT, {
      opacity: 0,
      turn: (index * 53) % 90,
      x,
      y: frame.edge.Top * 0.86,
    });
    set(id, ROOT, from, { opacity: 1 });
    go(id, ROOT, [from, from + 760, "In"], {
      turn: 220 + ((index * 71) % 200),
      x: x + (((index * 53) % 7) - 3) * frame.spread * 0.5,
      y: frame.edge.Bottom * 0.9,
    });
    set(id, ROOT, from + 760, { opacity: 0 });
  }

  starts("moment", ROOT, { ...at(frame.moment), opacity: 0 });
  set("moment", ROOT, MOMENT, { opacity: 1 });
  go("moment", ROOT, [KEPT, KEPT + 300, "InOut"], {
    ...at(frame.lines.Clip.at),
    scale: 0.12,
    turn: -8,
  });
  go("moment", ROOT, [KEPT + 210, KEPT + 300, "Linear"], { opacity: 0 });
};

const ending = ({ frame, go, set, starts }: Director) => {
  starts("slip", ROOT, { ...at(frame.slip), opacity: 0 });
  go("slip", ROOT, [SLIP, SLIP + 120, "Out"], { opacity: 1 });
  go("slip", ROOT, [SLIP_OUT, SLIP_OUT + 200, "In"], {
    opacity: 0,
    scale: 0.5,
    turn: 9,
    x: frame.edge.Right,
    y: frame.slip[1] - frame.spread * 4,
  });
  starts("title", ROOT, { ...at(frame.title), opacity: 0, scale: 1.5 });
  go("title", ROOT, [YOURS + 350, YOURS + 550, "Back"], {
    opacity: 1,
    scale: 1,
  });
  go("you", ROOT, [YOURS, YOURS + 550, "InOut"], frame.yours);
  go("you", "glow", [YOURS + 350, YOURS + 500, "Out"], { opacity: 1 });
  go("felt", ROOT, [YOURS, YOURS + 550, "InOut"], { scale: 1.04 });

  for (const index of [0, 1]) {
    const id = `seat-${index}`;
    const side = index === 0 ? -1 : 1;
    const dealt = YOURS + 550 + index * 70;

    starts(id, ROOT, {
      opacity: 0,
      scale: 0.5,
      turn: 60,
      x: frame.yours.x,
      y: frame.edge.Top * 0.5,
    });
    starts(id, "sh", lifted(8));
    set(id, ROOT, dealt, { opacity: 1 });
    go(id, ROOT, [dealt, dealt + 200, "Out"], {
      scale: 1.5,
      turn: side * 6,
      x: frame.yours.x + side * frame.spread * 1.25,
      y: frame.yours.y + frame.spread * 6.4,
    });
    go(id, "sh", [dealt, dealt + 200, "In"], lifted(2));
  }
};

const SCENES = [
  camera,
  seats,
  cast,
  talk,
  deal,
  betting,
  board,
  closeup,
  streets,
  showdown,
  river,
  aftermath,
  ending,
];

export const timedScoreFor = (frame: Cut): Film => {
  const film = emptyFilm(TIMED_LENGTH);
  const director = directorOf(film, frame, PACE);

  for (const scene of SCENES) {
    scene(director);
  }

  return film;
};
