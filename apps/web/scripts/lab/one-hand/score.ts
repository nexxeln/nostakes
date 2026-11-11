import type { Expression } from "@nostakes/avatar";

import { CLOSEUP_SHEETS } from "./art.js";
import { LINE_NAMES, PLAYERS } from "./cuts.js";
import type { Cut, LineName, Player, Point, ShotName } from "./cuts.js";
import { ROOT, cut, emptyFilm, move, rest } from "./engine.js";
import type { Ease, Film, Pose } from "./engine.js";

export const ROLES: Readonly<
  Record<
    Player,
    {
      readonly acts: readonly string[];
      readonly city: string;
      readonly clock: string;
      readonly expressions: readonly Expression[];
      readonly poke: Expression;
      readonly won: string;
    }
  >
> = {
  Dev: {
    acts: ["Fold"],
    city: "Lisbon",
    clock: "2:11 am",
    expressions: ["Resting", "Folded", "Happy"],
    poke: "Folded",
    won: "",
  },
  Jonas: {
    acts: ["Call 60", "Call 180", "Call 760"],
    city: "Berlin",
    clock: "3:06 am",
    expressions: ["Resting", "Thinking", "Happy", "Gutted"],
    poke: "Thinking",
    won: "",
  },
  Maya: {
    acts: ["Call 60", "Fold"],
    city: "San Francisco",
    clock: "6:04 pm",
    expressions: ["Resting", "LookingDown", "Folded", "Happy"],
    poke: "LookingDown",
    won: "",
  },
  Priya: {
    acts: ["Raise 60", "Bet 180", "All in 760"],
    city: "Bangalore",
    clock: "7:35 am",
    expressions: ["Resting", "Thinking", "Happy", "Gutted"],
    poke: "Happy",
    won: "+2,120",
  },
  Sam: {
    acts: ["Call 60", "Fold"],
    city: "Toronto",
    clock: "9:02 pm",
    expressions: ["Resting", "Thinking", "Folded", "Happy"],
    poke: "Happy",
    won: "",
  },
};

export const LINES: Readonly<
  Record<LineName, { readonly say: string; readonly who: Player }>
> = {
  Clip: { say: "keeping this", who: "Maya" },
  DevFive: { say: "5 min", who: "Dev" },
  DevHere: { say: "here we go", who: "Dev" },
  DevKing: { say: "i folded a king", who: "Dev" },
  DevNight: { say: "gn", who: "Dev" },
  JonasFine: { say: "fine. in.", who: "Jonas" },
  JonasLate: { say: "it's 3 am here", who: "Jonas" },
  JonasRematch: { say: "rematch. sunday.", who: "Jonas" },
  Link: { say: "", who: "Sam" },
  MayaIn: { say: "in", who: "Maya" },
  MayaNext: { say: "same time next week?", who: "Maya" },
  MayaNo: { say: "NO", who: "Maya" },
  MayaPriya: { say: "priya no", who: "Maya" },
  PriyaDealing: { say: "who's dealing", who: "Priya" },
  PriyaSleep: { say: "sleep well, jonas", who: "Priya" },
  SamHaha: { say: "lol", who: "Sam" },
  SamLocked: { say: "there's a seat open", who: "Sam" },
  SamRules: { say: "straddles on. run it twice.", who: "Sam" },
  SamTonight: { say: "poker tonight?", who: "Sam" },
  SamUnchanged: { say: "they haven't changed, maya", who: "Sam" },
};

export const CAPTIONS: readonly {
  readonly from: number;
  readonly id: string;
  readonly lines: readonly string[];
  readonly to: number;
}[] = [
  {
    from: 0,
    id: "cap-open",
    lines: ["Free. Nobody signs up.", "Scroll to deal them in"],
    to: 22,
  },
  {
    from: 26,
    id: "cap-link",
    lines: ["9:02 pm, Toronto.", "Sam drops a link in the group chat."],
    to: 108,
  },
  {
    from: 140,
    id: "cap-zones",
    lines: ["Five friends, four time zones.", "Nobody downloaded anything."],
    to: 190,
  },
  {
    from: 196,
    id: "cap-rules",
    lines: ["House rules are the host's.", "Tonight that's Sam."],
    to: 220,
  },
  {
    from: 228,
    id: "cap-seal",
    lines: ["The deck is sealed before the deal.", "Every phone checks it."],
    to: 264,
  },
  {
    from: 344,
    id: "cap-peek",
    lines: ["Hold your cards to peek.", "Maya has looked three times."],
    to: 390,
  },
  { from: 408, id: "cap-raise", lines: ["Drag a chip to raise."], to: 446 },
  {
    from: 450,
    id: "cap-fold",
    lines: ["Flick your cards away to fold."],
    to: 472,
  },
  {
    from: 576,
    id: "cap-odds",
    lines: ["All in, cards up.", "The table does the math."],
    to: 632,
  },
  {
    from: 760,
    id: "cap-moment",
    lines: ["The table calls the hand.", "Keep the picture, or the clip."],
    to: 818,
  },
  {
    from: 826,
    id: "cap-kept",
    lines: ["Maya kept the clip.", "Jonas will hear about it all year."],
    to: 852,
  },
  {
    from: 876,
    id: "cap-settle",
    lines: ["Who pays whom.", "It keeps the count, never the money."],
    to: 930,
  },
  {
    from: 984,
    id: "cap-end",
    lines: ["Free. Nobody signs up.", "Seats nine."],
    to: 1001,
  },
];

export const RIVER_CAPTION = { from: 640, id: "cap-river", to: 704 };

export const STREETS: readonly {
  readonly from: number;
  readonly id: string;
  readonly name: string;
  readonly to: number;
}[] = [
  { from: 0, id: "street-deal", name: "The deal", to: 262 },
  { from: 262, id: "street-flop", name: "The flop", to: 472 },
  { from: 472, id: "street-turn", name: "The turn", to: 606 },
  { from: 606, id: "street-river", name: "The river", to: 842 },
  { from: 842, id: "street-settle", name: "Settle up", to: 972 },
];

export const BETS: readonly {
  readonly amount: string;
  readonly chips: readonly number[];
  readonly gathered: number;
  readonly id: string;
  readonly out: number;
  readonly who: Player;
}[] = [
  {
    amount: "60",
    chips: [0],
    gathered: 292,
    id: "bet-priya-pre",
    out: 270,
    who: "Priya",
  },
  {
    amount: "60",
    chips: [1],
    gathered: 293,
    id: "bet-sam-pre",
    out: 276,
    who: "Sam",
  },
  {
    amount: "60",
    chips: [3],
    gathered: 294,
    id: "bet-maya-pre",
    out: 280,
    who: "Maya",
  },
  {
    amount: "60",
    chips: [2],
    gathered: 295,
    id: "bet-jonas-pre",
    out: 284,
    who: "Jonas",
  },
  {
    amount: "180",
    chips: [0],
    gathered: 464,
    id: "bet-priya-flop",
    out: 430,
    who: "Priya",
  },
  {
    amount: "180",
    chips: [2],
    gathered: 465,
    id: "bet-jonas-flop",
    out: 458,
    who: "Jonas",
  },
  {
    amount: "760",
    chips: [0, 4, 0],
    gathered: 542,
    id: "bet-priya-turn",
    out: 498,
    who: "Priya",
  },
  {
    amount: "760",
    chips: [2, 1, 2],
    gathered: 543,
    id: "bet-jonas-turn",
    out: 530,
    who: "Jonas",
  },
];

export const SCRAPS = 14;

export const scrapId = (index: number) => `scrap-${index}`;

export const holeId = (player: Player, index: number) =>
  `h-${player.toLowerCase()}-${index}`;

export const actorId = (player: Player) => player.toLowerCase();

export const emptyId = (player: Player) => `empty-${player.toLowerCase()}`;

export const lineId = (name: LineName) => `say-${name.toLowerCase()}`;

const HOLE_SMALL = 0.56;

const at = (point: Point): Pick<Pose, "x" | "y"> => ({
  x: point[0],
  y: point[1],
});

const plus = (point: Point, dx: number, dy: number): Point => [
  point[0] + dx,
  point[1] + dy,
];

const between = (from: Point, to: Point, amount: number): Point => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
];

const SHADOW = { x: 1, y: 1.8 };

const lifted = (height: number) => ({
  x: SHADOW.x + height * 0.55,
  y: SHADOW.y + height,
});

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
    from: 176,
    origin: (frame, seat) => [frame.edge.Right, seat[1] - 60],
    to: 194,
    turn: 50,
  },
  Jonas: {
    ease: "InOut",
    from: 146,
    origin: (frame, seat) => [frame.edge.Left, seat[1]],
    to: 164,
    turn: 0,
  },
  Maya: {
    ease: "Back",
    from: 116,
    origin: (frame, seat) => [seat[0], frame.edge.Top],
    to: 132,
    turn: -14,
  },
  Priya: {
    ease: "Back",
    from: 132,
    origin: (frame, seat) => [seat[0], frame.edge.Bottom],
    to: 148,
    turn: 20,
  },
};

const DEPARTURES: Readonly<
  Record<
    Player,
    {
      readonly from: number;
      readonly target: (cut: Cut, seat: Point) => Point;
      readonly to: number;
      readonly turn: number;
    }
  >
> = {
  Dev: {
    from: 936,
    target: (frame, seat) => [frame.edge.Right, seat[1] + 40],
    to: 946,
    turn: 30,
  },
  Jonas: {
    from: 962,
    target: (frame, seat) => [frame.edge.Left, seat[1]],
    to: 974,
    turn: -6,
  },
  Maya: {
    from: 944,
    target: (frame, seat) => [seat[0], frame.edge.Top],
    to: 954,
    turn: -12,
  },
  Priya: {
    from: 954,
    target: (frame, seat) => [seat[0], frame.edge.Bottom],
    to: 964,
    turn: 16,
  },
  Sam: {
    from: 972,
    target: (frame, seat) => [seat[0], frame.edge.Top],
    to: 982,
    turn: 8,
  },
};

const DEAL_ORDER: readonly Player[] = ["Maya", "Jonas", "Priya", "Dev", "Sam"];

const DEAL_FROM = 248;

const DEAL_STEP = 1.3;

const DEAL_TRAVEL = 7;

const LINE_TIMES: Readonly<Record<LineName, number>> = {
  Clip: 824,
  DevFive: 96,
  DevHere: 512,
  DevKing: 734,
  DevNight: 930,
  JonasFine: 88,
  JonasLate: 70,
  JonasRematch: 954,
  Link: 32,
  MayaIn: 48,
  MayaNext: 938,
  MayaNo: 724,
  MayaPriya: 588,
  PriyaDealing: 58,
  PriyaSleep: 946,
  SamHaha: 744,
  SamLocked: 964,
  SamRules: 194,
  SamTonight: 22,
  SamUnchanged: 362,
};

const SHOT_TIMES: readonly (readonly [number, number, ShotName])[] = [
  [300, 312, "Board"],
  [326, 334, "Table"],
  [552, 570, "Duel"],
  [606, 624, "River"],
  [724, 740, "Table"],
];

const BACK_DEPTH = 0.82;

interface Director {
  readonly acts: (
    player: Player,
    index: number,
    from: number,
    to: number
  ) => void;
  readonly clock: (id: string, from: number, to: number, stop: number) => void;
  readonly express: (
    player: Player,
    when: number,
    expression: Expression
  ) => void;
  readonly flick: (sprite: string, from: number, towards: Point) => void;
  readonly flip: (sprite: string, from: number, to: number) => void;
  readonly folds: (player: Player, when: number, act: number) => void;
  readonly frame: Cut;
  readonly go: (
    sprite: string,
    part: string,
    span: readonly [from: number, to: number, ease?: Ease],
    pose: Partial<Pose>
  ) => void;
  readonly set: (
    sprite: string,
    part: string,
    when: number,
    pose: Partial<Pose>
  ) => void;
  readonly starts: (sprite: string, part: string, pose: Partial<Pose>) => void;
}

const QUARTERS = [0, 1, 2, 3];

const directorOf = (film: Film, frame: Cut): Director => {
  const go: Director["go"] = (sprite, part, span, pose) => {
    const [from, to, ease] = span;

    move(film, [sprite, part], { ease: ease ?? "Out", from, to }, pose);
  };

  const set: Director["set"] = (sprite, part, when, pose) => {
    cut(film, [sprite, part], when, pose);
  };

  const starts: Director["starts"] = (sprite, part, pose) => {
    rest(film, sprite, part, pose);
  };

  const express: Director["express"] = (player, when, expression) => {
    for (const known of ROLES[player].expressions) {
      set(actorId(player), `ex-${known}`, when, {
        opacity: known === expression ? 1 : 0,
      });
    }
  };

  const acts: Director["acts"] = (player, index, from, to) => {
    const id = actorId(player);

    set(id, "city", from, { opacity: 0 });
    set(id, `act-${index}`, from, { opacity: 1 });
    set(id, `act-${index}`, to, { opacity: 0 });
    set(id, "city", to, { opacity: 1 });
  };

  const clock: Director["clock"] = (id, from, to, stop) => {
    const quarter = (to - from) / 4;

    set(id, "ring", from, { opacity: 1 });

    for (const side of QUARTERS.filter(
      (each) => from + each * quarter < stop
    )) {
      const begins = from + side * quarter;
      const ends = Math.min(stop, begins + quarter);

      go(id, `ring-${side}`, [begins, ends, "Linear"], {
        squeeze: 1 - (ends - begins) / quarter,
      });
    }

    set(id, "ring", stop, { opacity: 0 });
  };

  const flip: Director["flip"] = (sprite, from, to) => {
    const middle = (from + to) / 2;

    go(sprite, "bd", [from, middle, "In"], { squeeze: 0.04 });
    set(sprite, "bk", middle, { opacity: 0 });
    set(sprite, "fc", middle, { opacity: 1 });
    go(sprite, "bd", [middle, to, "Out"], { squeeze: 1 });
    go(sprite, "sh", [from, middle, "Out"], lifted(5));
    go(sprite, "sh", [middle, to, "In"], SHADOW);
  };

  const flick: Director["flick"] = (sprite, from, towards) => {
    go(sprite, ROOT, [from, from + 8, "In"], {
      ...at(towards),
      scale: 0.7,
      turn: 160,
    });
    go(sprite, ROOT, [from + 4, from + 8, "Linear"], { opacity: 0 });
  };

  const muck: Point = plus(frame.pot, 0, -frame.spread * 2);

  const folds: Director["folds"] = (player, when, act) => {
    flick(holeId(player, 0), when, muck);
    flick(holeId(player, 1), when + 1, muck);
    express(player, when + 3, "Folded");
    acts(player, act, when + 2, when + 30);
  };

  return { acts, clock, express, flick, flip, folds, frame, go, set, starts };
};

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
    const shake = 712 + index * 2;

    go("world", ROOT, [shake, shake + 2, "Linear"], {
      x: frame.shots.River.x + dx,
    });
  }
};

const opening = ({ frame, go, set, starts }: Director) => {
  starts("headline", ROOT, { ...at(frame.headline), turn: -1.5 });
  starts("headline", "sh", lifted(3));
  go("headline", "sh", [8, 20, "In"], lifted(16));
  go("headline", ROOT, [12, 30, "In"], {
    turn: -8,
    x: frame.headline[0] - frame.spread,
    y: frame.edge.Top,
  });
  set("headline", ROOT, 30, { opacity: 0 });
  starts(actorId("Sam"), ROOT, at(frame.seats.Sam));
  starts("you", ROOT, at(frame.you));
  starts("you", "glow", { opacity: 0 });
  starts("felt", ROOT, {});
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

const emptySeats = ({ frame, go, starts }: Director) => {
  for (const player of PLAYERS) {
    const id = emptyId(player);
    const leaving = DEPARTURES[player];

    starts(id, ROOT, {
      ...at(frame.seats[player]),
      opacity: player === "Sam" ? 0 : 1,
    });

    if (player !== "Sam") {
      const arrival = ARRIVALS[player];

      go(id, ROOT, [arrival.to - 6, arrival.to - 1, "In"], {
        opacity: 0,
        scale: 0.9,
      });
    }

    go(id, ROOT, [leaving.to, leaving.to + 8, "Out"], { opacity: 1, scale: 1 });
  }
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
    set(id, "place", 250, { opacity: 0 });
    set(id, "city", 250, { opacity: 1 });

    const okAt = 236 + PLAYERS.indexOf(player) * 2;

    go(id, "ok", [okAt, okAt + 5, "Back"], { opacity: 1, scale: 1 });
    go(id, "ok", [256, 260, "In"], { opacity: 0, scale: 0.6 });

    if (player !== "Sam") {
      seated(director, player);
    }

    const leaving = DEPARTURES[player];

    go(id, "sh", [leaving.from - 4, leaving.from + 2, "Out"], lifted(12));
    go(id, ROOT, [leaving.from, leaving.to, "In"], {
      ...at(leaving.target(frame, frame.seats[player])),
      scale: 1.25,
      turn: leaving.turn,
    });
    set(id, ROOT, leaving.to, { opacity: 0 });
  }

  express("Dev", 176, "Folded");
  express("Dev", 198, "Resting");
  express("Sam", 22, "Happy");
  express("Sam", 44, "Resting");
};

const talk = ({ frame, go, starts }: Director) => {
  for (const name of LINE_NAMES) {
    const id = lineId(name);
    const spot = frame.lines[name];
    const when = LINE_TIMES[name];

    starts(id, ROOT, {
      ...at(plus(spot.at, 0, frame.spread * 0.8)),
      opacity: 0,
      scale: 0.7,
      turn: -4,
    });
    go(id, ROOT, [when, when + 6, "Back"], {
      ...at(spot.at),
      opacity: 1,
      scale: 1,
      turn: (when % 5) - 2,
    });
    go(id, ROOT, [when + 6, when + 8, "Linear"], { turn: 3 });
    go(id, ROOT, [when + 8, when + 10, "Linear"], { turn: -2 });
    go(id, ROOT, [when + 10, when + 12, "Linear"], { turn: 0 });
    go(id, ROOT, [spot.until, spot.until + 6, "In"], {
      opacity: 0,
      scale: 0.8,
      y: spot.at[1] - frame.spread * 0.6,
    });
  }
};

const rules = ({ frame, go, starts }: Director) => {
  starts("rules", ROOT, {
    ...at(plus(frame.seats.Sam, 0, frame.spread)),
    opacity: 0,
    scale: 0.4,
    turn: -12,
  });
  starts("rules", "sh", lifted(8));
  go("rules", ROOT, [198, 210, "Back"], {
    ...at(frame.rules),
    opacity: 1,
    scale: 1,
    turn: -2,
  });
  go("rules", "sh", [198, 210, "In"], SHADOW);
  go("rules", ROOT, [216, 224, "In"], {
    opacity: 0,
    turn: 10,
    x: frame.edge.Right,
  });
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
  go("deck", ROOT, [220, 228, "Back"], {
    ...at(frame.deck),
    opacity: 1,
    scale: 1,
    turn: 0,
  });
  go("deck", "sh", [220, 228, "In"], SHADOW);
  go("deck", "band", [229, 235, "Back"], { opacity: 1, scale: 1 });
  go("deck", "band", [244, 248, "In"], { opacity: 0, scale: 1.3 });
  go("deck", ROOT, [264, 272, "InOut"], {
    ...at(frame.dealer),
    scale: 0.8,
    turn: -6,
  });
  go("deck", ROOT, [844, 852, "In"], { opacity: 0, y: frame.edge.Top });
  starts("button", ROOT, { ...at(frame.button), opacity: 0, scale: 0.4 });
  go("button", ROOT, [242, 250, "Back"], { opacity: 1, scale: 1 });
  go("button", ROOT, [846, 852, "In"], { opacity: 0, scale: 0.4 });

  for (const [order, player] of DEAL_ORDER.entries()) {
    for (const index of [0, 1]) {
      const id = holeId(player, index);
      const dealt = DEAL_FROM + (order + index * DEAL_ORDER.length) * DEAL_STEP;
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
      go(id, ROOT, [dealt, dealt + DEAL_TRAVEL, "Out"], {
        ...at(plus(frame.holes[player], side * frame.spread * 0.3, index)),
        turn: side * 7,
      });
    }
  }
};

const betting = ({ frame, go, set, starts }: Director) => {
  for (const bet of BETS) {
    const spot = frame.bets[bet.who];

    starts(bet.id, ROOT, {
      ...at(between(frame.seats[bet.who], spot, 0.2)),
      opacity: 0,
      scale: 0.6,
    });
    go(bet.id, ROOT, [bet.out, bet.out + 6, "Out"], {
      ...at(spot),
      opacity: 1,
      scale: 1,
    });
    go(bet.id, ROOT, [bet.gathered, bet.gathered + 7, "InOut"], {
      ...at(frame.pot),
      scale: 0.7,
    });
    go(bet.id, ROOT, [bet.gathered + 4, bet.gathered + 7, "Linear"], {
      opacity: 0,
    });
  }

  starts("pot", ROOT, { ...at(frame.pot), opacity: 0, scale: 0.6 });
  starts("pot", "v-0", { opacity: 1 });
  starts("pot", "v-1", { opacity: 0 });
  starts("pot", "v-2", { opacity: 0 });
  go("pot", ROOT, [298, 304, "Back"], { opacity: 1, scale: 1 });
  set("pot", "v-0", 470, { opacity: 0 });
  set("pot", "v-1", 470, { opacity: 1 });
  go("pot", ROOT, [468, 471, "Out"], { scale: 1.15 });
  go("pot", ROOT, [471, 476, "Back"], { scale: 1 });
  set("pot", "v-1", 548, { opacity: 0 });
  set("pot", "v-2", 548, { opacity: 1 });
  go("pot", ROOT, [546, 549, "Out"], { scale: 1.25 });
  go("pot", ROOT, [549, 556, "Back"], { scale: 1 });
  go("pot", ROOT, [728, 740, "InOut"], {
    ...at(plus(frame.seats.Priya, 0, -frame.spread)),
    scale: 0.8,
  });
  go("pot", ROOT, [737, 741, "Linear"], { opacity: 0 });
};

const board = ({ flip, frame, go, set, starts }: Director) => {
  for (const [index, slot] of frame.board.slice(0, 4).entries()) {
    const id = `b-${index}`;
    const out = index < 3 ? 302 + index * 3 : 474;
    const turned = index < 3 ? 314 + index * 5 : 482;

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
    go(id, ROOT, [out, out + 9, "Out"], { ...at(slot), scale: 1, turn: 0 });
    flip(id, turned, turned + 8);
    go(id, ROOT, [846 + index, 854 + index, "In"], {
      ...at(frame.dealer),
      opacity: 0,
      scale: 0.5,
    });
  }
};

const PEEKS: readonly (readonly [number, boolean])[] = [
  [346, true],
  [353, false],
  [359, true],
  [366, false],
  [372, true],
  [379, false],
];

const CLOSEUPS = [
  { enters: 330, id: "closeup-maya", leaves: 382, side: -1 },
  { enters: 394, id: "closeup-priya", leaves: 434, side: 1 },
] as const;

const closeups = ({ frame, go, set, starts }: Director) => {
  for (const { enters, id, leaves, side } of CLOSEUPS) {
    const away = {
      scale: 0.86,
      turn: side * 13,
      x: (side < 0 ? frame.edge.Left : frame.edge.Right) * 1.4,
      y: frame.closeup[1] + frame.spread * 2,
    };

    starts(id, ROOT, { ...away, opacity: 0 });
    starts(id, "sh", lifted(18));
    set(id, ROOT, enters, { opacity: 1 });
    go(id, ROOT, [enters, enters + 14, "Out"], {
      ...at(frame.closeup),
      scale: 1,
      turn: side * -2,
    });
    go(id, "sh", [enters + 4, enters + 16, "In"], lifted(5));
    go(id, "sh", [leaves - 2, leaves + 4, "Out"], lifted(18));
    go(id, ROOT, [leaves, leaves + 12, "In"], away);
    set(id, ROOT, leaves + 12, { opacity: 0 });

    for (let sheet = 1; sheet < CLOSEUP_SHEETS; sheet += 1) {
      const apart = { x: -sheet * 1.5, y: -sheet * 2.6 };

      starts(id, `ly-${sheet}`, apart);
      go(id, `ly-${sheet}`, [enters + 6, enters + 18, "Out"], { x: 0, y: 0 });
      go(id, `ly-${sheet}`, [leaves - 4, leaves + 4, "In"], apart);
    }
  }

  starts("closeup-maya", "st-Resting", { opacity: 1 });
  starts("closeup-maya", "st-LookingDown", { opacity: 0 });

  for (const [when, looking] of PEEKS) {
    set("closeup-maya", "st-Resting", when, { opacity: looking ? 0 : 1 });
    set("closeup-maya", "st-LookingDown", when, { opacity: looking ? 1 : 0 });
  }
};

const flop = ({ acts, clock, express, folds, go, starts }: Director) => {
  folds("Dev", 266, 0);
  acts("Priya", 0, 270, 296);
  acts("Sam", 0, 276, 296);
  acts("Maya", 0, 280, 296);
  acts("Jonas", 0, 284, 296);

  for (const [when, looking] of PEEKS) {
    express("Maya", when, looking ? "LookingDown" : "Resting");
  }

  folds("Maya", 388, 1);
  express("Priya", 404, "Thinking");
  clock(actorId("Priya"), 408, 444, 432);
  clock("closeup-priya", 408, 444, 432);
  starts("closeup-priya", "puck", { y: 36 });
  starts("closeup-priya", "read", { opacity: 0 });
  go("closeup-priya", "puck", [416, 430, "InOut"], { y: -32 });
  go("closeup-priya", "read", [417, 422, "Out"], { opacity: 1 });
  express("Priya", 432, "Resting");
  acts("Priya", 1, 434, 466);
  folds("Sam", 450, 1);
  express("Jonas", 456, "Thinking");
  express("Jonas", 460, "Resting");
  acts("Jonas", 1, 458, 468);
};

const DUEL = [
  ["Jonas", 552],
  ["Priya", 562],
] as const;

const turn = ({ acts, clock, express, flip, frame, go, starts }: Director) => {
  express("Priya", 492, "Thinking");
  express("Priya", 498, "Resting");
  acts("Priya", 2, 498, 716);
  clock(actorId("Jonas"), 520, 600, 530);
  express("Jonas", 520, "Thinking");
  express("Jonas", 530, "Resting");
  acts("Jonas", 2, 530, 716);

  for (const [who, shown] of DUEL) {
    for (const index of [0, 1]) {
      const id = holeId(who, index);
      const side = index === 0 ? -1 : 1;
      const when = shown + index * 3;

      go(id, ROOT, [when, when + 8, "Out"], {
        ...at(plus(frame.tabled[who], side * frame.spread, index * 2)),
        scale: 1,
        turn: side * 5,
      });
      flip(id, when + 5, when + 13);
      go(id, ROOT, [846, 854, "In"], {
        ...at(frame.dealer),
        opacity: 0,
        scale: 0.4,
      });
    }

    const tag = `chance-${who.toLowerCase()}`;

    starts(tag, ROOT, { ...at(frame.chance[who]), opacity: 0, scale: 1.6 });
    go(tag, ROOT, [576, 582, "Back"], { opacity: 1, scale: 1 });
    go(tag, ROOT, [714, 718, "In"], { opacity: 0, scale: 0.6 });
  }

  express("Jonas", 578, "Happy");
  express("Priya", 580, "Gutted");

  for (const player of ["Sam", "Maya", "Dev"] as const) {
    go(actorId(player), "tile", [556, 566, "Out"], { opacity: 0.5 });
    go(actorId(player), "tile", [716, 722, "Out"], { opacity: 1 });
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
  go("river", "hold", [632, 640, "Back"], { opacity: 1, scale: 1 });
  go("river", "hold", [696, 701, "In"], { opacity: 0, scale: 0.6 });
  set("river", ROOT, 610, { opacity: 1 });
  go("river", ROOT, [610, 636, "InOut"], {
    ...at(frame.hover),
    scale: 1.75,
    turn: -8,
  });
  go("river", "sh", [610, 636, "InOut"], lifted(13));
  set("river", "peek", 626, { scale: 1 });
  set("river", "peek", 702, { scale: 0 });
  go("river", ROOT, [636, 700, "Linear"], {
    ...at(plus(frame.hover, 0, -frame.spread * 0.5)),
    scale: 1.85,
    turn: 4,
  });
  go("river", ROOT, [702, 714, "In"], { ...at(slot), scale: 1, turn: 0 });
  flip("river", 702, 712);
  go("river", "sh", [712, 716, "In"], SHADOW);
  go("river", ROOT, [718, 724, "Back"], { y: slot[1] - frame.spread * 0.5 });
  go("river", ROOT, [850, 858, "In"], {
    ...at(frame.dealer),
    opacity: 0,
    scale: 0.5,
  });

  for (const index of [0, 1]) {
    go(holeId("Priya", index), ROOT, [719 + index, 725 + index, "Back"], {
      y: frame.tabled.Priya[1] - frame.spread * 0.6,
    });
  }
};

const aftermath = ({ express, frame, go, set, starts }: Director) => {
  express("Jonas", 718, "Gutted");
  express("Priya", 718, "Happy");
  express("Sam", 722, "Happy");
  express("Maya", 722, "Happy");
  express("Dev", 722, "Resting");
  go(actorId("Priya"), "tab", [738, 746, "Back"], { opacity: 1, scale: 1 });
  go(actorId("Priya"), "tab", [842, 848, "In"], { opacity: 0, scale: 0.6 });
  express("Sam", 846, "Resting");
  express("Maya", 846, "Resting");
  express("Dev", 936, "Folded");

  for (let index = 0; index < SCRAPS; index += 1) {
    const id = scrapId(index);
    const column = ((index * 37) % SCRAPS) / (SCRAPS - 1) - 0.5;
    const from = 716 + ((index * 5) % 9) * 2;
    const x = column * (frame.edge.Right - frame.edge.Left) * 0.62;

    starts(id, ROOT, {
      opacity: 0,
      turn: (index * 53) % 90,
      x,
      y: frame.edge.Top * 0.86,
    });
    set(id, ROOT, from, { opacity: 1 });
    go(id, ROOT, [from, from + 34, "In"], {
      turn: 220 + ((index * 71) % 200),
      x: x + (((index * 53) % 7) - 3) * frame.spread * 0.5,
      y: frame.edge.Bottom * 0.9,
    });
    set(id, ROOT, from + 34, { opacity: 0 });
  }

  starts("moment", ROOT, { ...at(frame.moment), opacity: 0 });
  set("moment", ROOT, 756, { opacity: 1 });
  go("moment", ROOT, [818, 832, "InOut"], {
    ...at(frame.lines.Clip.at),
    scale: 0.12,
    turn: -8,
  });
  go("moment", ROOT, [828, 832, "Linear"], { opacity: 0 });
};

const ending = ({ frame, go, set, starts }: Director) => {
  starts("slip", ROOT, { ...at(frame.slip), opacity: 0 });
  go("slip", ROOT, [866, 872, "Out"], { opacity: 1 });
  go("slip", ROOT, [928, 936, "In"], {
    opacity: 0,
    scale: 0.5,
    turn: 9,
    x: frame.edge.Right,
    y: frame.slip[1] - frame.spread * 4,
  });
  starts("title", ROOT, { ...at(frame.title), opacity: 0, scale: 1.5 });
  go("title", ROOT, [982, 990, "Back"], { opacity: 1, scale: 1 });
  go("you", ROOT, [974, 988, "InOut"], frame.yours);
  go("you", "glow", [984, 990, "Out"], { opacity: 1 });
  go("felt", ROOT, [974, 988, "InOut"], { scale: 1.04 });

  for (const index of [0, 1]) {
    const id = `seat-${index}`;
    const side = index === 0 ? -1 : 1;
    const dealt = 988 + index * 3;

    starts(id, ROOT, {
      opacity: 0,
      scale: 0.5,
      turn: 60,
      x: frame.yours.x,
      y: frame.edge.Top * 0.5,
    });
    starts(id, "sh", lifted(8));
    set(id, ROOT, dealt, { opacity: 1 });
    go(id, ROOT, [dealt, dealt + 8, "Out"], {
      scale: 1.5,
      turn: side * 6,
      x: frame.yours.x + side * frame.spread * 1.25,
      y: frame.yours.y + frame.spread * 6.4,
    });
    go(id, "sh", [dealt, dealt + 8, "In"], lifted(2));
  }
};

const SCENES = [
  camera,
  opening,
  emptySeats,
  cast,
  talk,
  rules,
  deal,
  betting,
  board,
  closeups,
  flop,
  turn,
  river,
  aftermath,
  ending,
];

export const scoreFor = (frame: Cut): Film => {
  const film = emptyFilm();
  const director = directorOf(film, frame);

  for (const scene of SCENES) {
    scene(director);
  }

  return film;
};
