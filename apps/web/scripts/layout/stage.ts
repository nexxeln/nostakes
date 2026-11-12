import {
  codeFor,
  DEFAULT_AVATAR,
  randomAvatar,
  render,
} from "@nostakes/avatar";

import "../../src/client/tokens.css";
import "../../src/client/app.css";
import { defineTable } from "../../src/client/table/element.js";
import { bountyHappenings } from "../../src/features/table/from-room.js";
import { Happenings, TABLE_TAG } from "../../src/features/table/snapshot.js";
import type {
  Happening,
  SeatPost,
  SeatSnapshot,
  TableSnapshot,
} from "../../src/features/table/snapshot.js";

const NAMES = [
  "Sam",
  "Maya",
  "Jonas",
  "Alexandra",
  "Dev",
  "Lou",
  "Priya",
  "Bartholomew",
  "Kit",
];

const BOARDS = [
  ["Ah", "Kd", "7s", "2c", "Kc"],
  ["Ah", "Kd", "7s", "Qh", "9d"],
  ["Ah", "Kd", "7s", "3s", "Js"],
];

const SHOWN = [
  ["Ad", "Kh"],
  ["Qs", "Qd"],
  ["Tc", "Jc"],
];

const SHOWDOWN_SEATS = [0, 4, 7];

const PLAYERS_MAX = 9;

const params = new URLSearchParams(globalThis.location.search);

const players = Math.min(
  PLAYERS_MAX,
  Math.max(2, Number(params.get("players") ?? "9"))
);

const boards = Math.min(
  BOARDS.length,
  Math.max(1, Number(params.get("boards") ?? "3"))
);

const TALLEST_HAT = codeFor({
  ...DEFAULT_AVATAR,
  headwear: "Fedora",
  species: "Octopus",
});

const tallest = params.get("hat") === "tallest";

const seatOf = (index: number): SeatSnapshot => {
  const shownAt = SHOWDOWN_SEATS.indexOf(index);
  const shown = shownAt === -1 ? [] : (SHOWN[shownAt] ?? []);

  return {
    avatar: tallest ? TALLEST_HAT : codeFor(randomAvatar(index * 7919 + 17)),
    away: false,
    bet: 0,
    cardsHeld: shown.length === 0 ? 0 : 2,
    name: NAMES[index] ?? `Seat ${index + 1}`,
    note: "",
    peeking: false,
    seat: index,
    shown,
    stack: 0,
    status: shown.length === 0 ? "Folded" : "AllIn",
  };
};

const showdown: TableSnapshot = {
  afterHand: { bothOnly: false, closes: null, rabbit: false, showable: [] },
  bigBlind: 20,
  boards: BOARDS.slice(0, boards),
  buttonSeat: 2,
  clock: null,
  entry: null,
  events: [],
  handId: 7,
  heroCards: SHOWN[0] ?? [],
  heroSeat: 0,
  hostTools: false,
  learned: ["Peek", "Fold", "Raise", "Keys"],
  legal: null,
  posts: [],
  pots: [3600],
  rabbit: [],
  reactions: [],
  rules: null,
  runVote: null,
  seats: Array.from({ length: players }, (_, index) => seatOf(index)),
  toAct: null,
  waiting: "",
};

const TURN_STACKS = [398, 398, 412, 376, 398, 521, 455, 398, 240];

const TURN_BOARD = ["3c", "9h", "7d"];

const turnSeat = (index: number): SeatSnapshot => ({
  ...seatOf(index),
  cardsHeld: 2,
  shown: [],
  stack: TURN_STACKS[index] ?? 400,
  status: "In",
});

const turn: TableSnapshot = {
  ...showdown,
  boards: [TURN_BOARD],
  buttonSeat: players - 1,
  clock: { key: "turn", remainingMs: 600_000, seat: 0, totalMs: 967_742 },
  heroCards: ["Ad", "Kh"],
  learned: params.get("hints") === "1" ? [] : showdown.learned,
  legal: {
    call: null,
    check: true,
    fold: true,
    muck: false,
    raise: { isBet: true, max: 398, min: 4 },
    show: false,
  },
  pots: [18],
  seats: Array.from({ length: players }, (_, index) => turnSeat(index)),
  toAct: 0,
};

const BUTTON_AT = Math.max(1, players - 4);

const around = (step: number) => (BUTTON_AT + step) % players;

const STRADDLE_FROM = 4;

const postsAtStart: readonly SeatPost[] = [
  { posted: "SmallBlind", seat: around(1), settled: false },
  { posted: "BigBlind", seat: around(2), settled: false },
  ...(players >= STRADDLE_FROM
    ? [{ posted: "Straddle" as const, seat: around(3), settled: false }]
    : []),
];

const POSTED_CHIPS = { BigBlind: 2, SmallBlind: 1, Straddle: 4, ToComeIn: 2 };

const firstToAct = around(postsAtStart.length + 1);

const start: TableSnapshot = {
  ...turn,
  boards: [[]],
  buttonSeat: BUTTON_AT,
  clock: {
    key: "start",
    remainingMs: 21_000,
    seat: firstToAct,
    totalMs: 30_000,
  },
  handId: 8,
  legal: firstToAct === 0 ? turn.legal : null,
  posts: postsAtStart,
  pots: [],
  seats: turn.seats.map((seat) => {
    const post = postsAtStart.find(({ seat: at }) => at === seat.seat);
    const bet = post === undefined ? 0 : POSTED_CHIPS[post.posted];

    return { ...seat, bet, stack: seat.stack - bet };
  }),
  toAct: firstToAct,
};

const RAISER = 2;

const mid: TableSnapshot = {
  ...start,
  boards: [["3c", "9h", "7d"]],
  clock: { key: "mid", remainingMs: 14_000, seat: 1, totalMs: 30_000 },
  handId: 8,
  legal: null,
  posts: [],
  pots: [26],
  seats: start.seats.map((seat) => {
    if (seat.seat === RAISER) {
      return { ...seat, bet: 12, stack: seat.stack - 12 };
    }

    return players > 4 && seat.seat === players - 1
      ? { ...seat, bet: 0, cardsHeld: 0, status: "Folded" }
      : { ...seat, bet: 0 };
  }),
  toAct: 1,
};

const EMPTY_AT = BUTTON_AT;

const dead: TableSnapshot = {
  ...start,
  seats: start.seats.filter(({ seat }) => seat !== EMPTY_AT),
};

const WAITING_SEAT = 4;

const sittingBy = (seat: SeatSnapshot): SeatSnapshot =>
  seat.seat === 0 || seat.seat === WAITING_SEAT
    ? {
        ...seat,
        bet: 0,
        cardsHeld: 0,
        note: "Waits for BB",
        stack: seat.stack + seat.bet,
        status: "Out",
      }
    : seat;

const waitingForBig: TableSnapshot = {
  ...start,
  clock: { key: "waiting", remainingMs: 21_000, seat: 1, totalMs: 30_000 },
  entry: {
    action: "Post 2 to come in",
    line: "Waiting for the big blind",
    note: "",
    post: true,
  },
  heroCards: [],
  legal: null,
  seats: start.seats.map(sittingBy),
  toAct: 1,
};

const postingIn: TableSnapshot = {
  ...waitingForBig,
  entry: {
    action: "Wait for the big blind instead",
    line: "Posting 2 + 1 dead to come in",
    note: "The next hand is already set, so this counts from the one after.",
    post: false,
  },
  seats: waitingForBig.seats.map((seat) =>
    seat.seat === 0 ? { ...seat, note: "Posting in" } : seat
  ),
};

const AFTER_BOARD = ["3c", "9h", "7d", "Qs", "2h"];

const HERO_CARDS = ["Ad", "Kh"];

const afterHand = (
  shown: readonly string[],
  bothOnly: boolean
): TableSnapshot => ({
  ...mid,
  afterHand: {
    bothOnly,
    closes: { key: "next-deal", remainingMs: 6000 },
    rabbit: false,
    showable: HERO_CARDS.filter((card) => !shown.includes(card)),
  },
  boards: [AFTER_BOARD],
  clock: null,
  heroCards: HERO_CARDS,
  pots: [],
  seats: mid.seats.map((seat) =>
    seat.seat === 0 ? { ...seat, cardsHeld: 2, shown, status: "In" } : seat
  ),
  toAct: null,
});

const showdownTurn = (muck: boolean): TableSnapshot => ({
  ...mid,
  boards: [AFTER_BOARD],
  clock: { key: "showdown", remainingMs: 9000, seat: 0, totalMs: 15_000 },
  heroCards: HERO_CARDS,
  legal: {
    call: null,
    check: false,
    fold: false,
    muck,
    raise: null,
    show: true,
  },
  toAct: 0,
});

const ACTING_NAMES = [
  "Sam",
  "Maya",
  "Jonas",
  "Priya",
  "Dev",
  "Lou",
  "Kit",
  "Ana",
  "Ben",
];

const ACTING_STACKS = [1100, 620, 1180, 940, 1010, 600, 720, 1320, 380];

const ACTING_FOLDED = 3;

const nobodyActs = params.get("actor") === "none";

const actor = Math.min(
  players - 1,
  Math.max(0, Number(params.get("actor") ?? "2"))
);

const everyoneBets = Number(params.get("bets") ?? "0");

const sameName = params.get("name");

const actingSeat = (index: number): SeatSnapshot => {
  const folded = index === ACTING_FOLDED && (nobodyActs || index !== actor);

  return {
    ...seatOf(index),
    bet: everyoneBets,
    cardsHeld: folded ? 0 : 2,
    name: sameName ?? ACTING_NAMES[index] ?? `Seat ${index + 1}`,
    peeking: !nobodyActs && index === actor,
    shown: [],
    stack: ACTING_STACKS[index] ?? 1000,
    status: folded ? "Folded" : "In",
  };
};

const acting: TableSnapshot = {
  ...showdown,
  boards: [["Ah", "Kd", "7s", "2c"]],
  buttonSeat: 1 % players,
  clock: nobodyActs
    ? null
    : {
        key: `acting-${actor}`,
        remainingMs: 17_000,
        seat: actor,
        totalMs: 30_000,
      },
  heroCards: ["Ad", "Kh"],
  legal: actor === 0 && !nobodyActs ? turn.legal : null,
  posts:
    everyoneBets > 0
      ? [
          { posted: "SmallBlind", seat: 1 % players, settled: false },
          { posted: "BigBlind", seat: 2 % players, settled: false },
        ]
      : [],
  pots: [960],
  seats: Array.from({ length: players }, (_, index) => actingSeat(index)),
  toAct: nobodyActs ? null : actor,
};

const BOUNTY = 20;

const BOUNTY_POT = 26;

const BOUNTY_WINNER = Math.min(2, players - 1);

const BOUNTY_CARDS = ["7h", "2c"];

const bountyPaid: TableSnapshot = {
  ...afterHand([], false),
  boards: [[]],
  seats: mid.seats.map((seat) =>
    seat.seat === BOUNTY_WINNER
      ? {
          ...seat,
          bet: 0,
          cardsHeld: 2,
          shown: BOUNTY_CARDS,
          stack: seat.stack + BOUNTY_POT + BOUNTY * (players - 1),
          status: "In",
        }
      : {
          ...seat,
          bet: 0,
          cardsHeld: 0,
          shown: [],
          stack: seat.stack - BOUNTY,
          status: "Folded",
        }
  ),
};

const bountyTold: readonly Happening[] = [
  Happenings.Show.make({
    cards: BOUNTY_CARDS,
    label: "Shows",
    seat: BOUNTY_WINNER,
  }),
  ...bountyHappenings(
    BOUNTY_WINNER,
    bountyPaid.seats.flatMap(({ seat }) =>
      seat === BOUNTY_WINNER ? [] : [{ amount: BOUNTY, seat }]
    )
  ),
];

const RIVER_BET = Number(params.get("bets") ?? "24");

const RIVER_WINNER = Math.min(2, players - 1);

const RIVER_POT = 26;

const HAND_LABELS = ["Full house", "Two pair", "Straight", "Flush"];

const deals: readonly Happening[] = [
  Happenings.Start.make({ hand: 8 }),
  ...Array.from({ length: players }, (__, seat) =>
    Happenings.Deal.make({ cards: 2, seat })
  ),
];

const withSeats = (
  base: TableSnapshot,
  seatOfHand: (seat: SeatSnapshot) => SeatSnapshot
): TableSnapshot => ({ ...base, seats: base.seats.map(seatOfHand) });

const preflop: TableSnapshot = withSeats(
  {
    ...start,
    clock: { key: "preflop", remainingMs: 21_000, seat: 0, totalMs: 30_000 },
  },
  (seat) =>
    seat.seat === firstToAct
      ? { ...seat, bet: 12, stack: seat.stack - 12 + seat.bet }
      : seat
);

const flopDealt: TableSnapshot = withSeats(
  { ...mid, clock: null, pots: [26 + 12] },
  (seat) => ({ ...seat, bet: 0 })
);

const riverOut = (toAct: number | null): TableSnapshot =>
  withSeats(
    {
      ...turn,
      boards: [AFTER_BOARD],
      clock:
        toAct === null
          ? null
          : {
              key: `river-${toAct}`,
              remainingMs: 14_000,
              seat: toAct,
              totalMs: 30_000,
            },
      heroCards: HERO_CARDS,
      legal: toAct === 0 ? turn.legal : null,
      pots: [RIVER_POT],
      toAct,
    },
    (seat) => ({
      ...seat,
      bet: RIVER_BET,
      cardsHeld: 2,
      stack: seat.stack - RIVER_BET,
      status: "In",
    })
  );

const allIn: TableSnapshot = withSeats(riverOut(0), (seat) =>
  seat.seat === RIVER_WINNER
    ? { ...seat, bet: seat.stack + seat.bet, stack: 0, status: "AllIn" }
    : seat
);

const RIVER_TOTAL = RIVER_POT + RIVER_BET * players;

const atShowdown: TableSnapshot = {
  ...withSeats(riverOut(null), (seat) => ({
    ...seat,
    bet: 0,
    shown: seat.seat === 0 ? HERO_CARDS : seat.shown,
  })),
  afterHand: {
    bothOnly: false,
    closes: { key: "showdown-window", remainingMs: 9000 },
    rabbit: false,
    showable: [HERO_CARDS[1] ?? "Kh"],
  },
  pots: [RIVER_TOTAL],
};

const settledWith = (winner: number): TableSnapshot => ({
  ...withSeats(atShowdown, (seat) => ({
    ...seat,
    stack: seat.stack + (seat.seat === winner ? RIVER_TOTAL : 0),
  })),
  clock: null,
  pots: [],
});

const shows = (seats: readonly number[]): readonly Happening[] =>
  seats.map((seat, index) =>
    Happenings.Show.make({
      cards: seat === 0 ? HERO_CARDS : ["Qd", "Qc"],
      label: HAND_LABELS[index % HAND_LABELS.length] ?? "Pair",
      seat,
    })
  );

const SIDE_POT = 20;

const splitBetween = (
  winners: readonly (readonly [number, number])[]
): TableSnapshot => ({
  ...withSeats(atShowdown, (seat) => ({
    ...seat,
    stack:
      seat.stack +
      winners
        .filter(([at]) => at === seat.seat)
        .reduce((total, [, amount]) => total + amount, 0),
  })),
  clock: null,
  pots: [],
});

const MAIN_AND_SIDE: readonly (readonly [number, number])[] = [
  [0, RIVER_TOTAL - SIDE_POT],
  [0, SIDE_POT],
];

const MAIN_TO_THEM: readonly (readonly [number, number])[] = [
  [RIVER_WINNER, RIVER_TOTAL - SIDE_POT],
  [0, SIDE_POT],
];

const paid = (
  winners: readonly (readonly [number, number])[]
): readonly Happening[] => [
  ...shows([0, RIVER_WINNER]),
  ...winners.map(([seat, amount]) => Happenings.Win.make({ amount, seat })),
];

const awardTo = (winner: number): readonly Happening[] => [
  ...shows([0, RIVER_WINNER]),
  Happenings.Win.make({ amount: RIVER_TOTAL, seat: winner }),
];

type HandStep = readonly [TableSnapshot, readonly Happening[], TableSnapshot?];

const HAND_STEPS: readonly HandStep[] = [
  [start, deals],
  [
    preflop,
    [
      Happenings.Bet.make({
        added: 12,
        allIn: false,
        raise: true,
        seat: firstToAct,
        to: 12,
      }),
    ],
  ],
  [flopDealt, [Happenings.Collect.make({ street: "Flop" })], preflop],
  [turn, [Happenings.Collect.make({ street: "Turn" })]],
  [
    riverOut(1 % players),
    Array.from({ length: players }, (__, seat) =>
      seat === 0
        ? Happenings.Bet.make({
            added: RIVER_BET,
            allIn: false,
            raise: false,
            seat,
            to: RIVER_BET,
          })
        : Happenings.Call.make({ added: RIVER_BET, allIn: false, seat })
    ),
  ],
  [
    allIn,
    [
      Happenings.Bet.make({
        added: RIVER_BET,
        allIn: true,
        raise: true,
        seat: RIVER_WINNER,
        to: RIVER_BET,
      }),
    ],
  ],
  [atShowdown, shows([0, RIVER_WINNER]), riverOut(null)],
  [settledWith(0), awardTo(0), atShowdown],
  [settledWith(RIVER_WINNER), awardTo(RIVER_WINNER), atShowdown],
  [{ ...start, handId: 9 }, deals],
  [splitBetween(MAIN_AND_SIDE), paid(MAIN_AND_SIDE), atShowdown],
  [splitBetween(MAIN_TO_THEM), paid(MAIN_TO_THEM), atShowdown],
];

const handStep = Math.min(
  HAND_STEPS.length - 1,
  Math.max(0, Number(params.get("step") ?? "0"))
);

const [handSnapshot, handTold, handFrom] = HAND_STEPS[handStep] ?? [
  start,
  deals,
];

const TOLD = new Map<string, readonly Happening[]>([
  ["bounty", bountyTold],
  ["hand", handTold],
]);

const SCENES = new Map<string, TableSnapshot>([
  ["acting", acting],
  ["hand", handSnapshot],
  ["bounty", bountyPaid],
  ["after", afterHand([], false)],
  ["after-one", afterHand(["Kh"], false)],
  ["after-all", afterHand(HERO_CARDS, false)],
  ["after-both-only", afterHand([], true)],
  ["showdown-muck", showdownTurn(true)],
  ["showdown-win", showdownTurn(false)],
  ["posting", postingIn],
  ["waiting", waitingForBig],
  ["dead", dead],
  ["mid", mid],
  ["start", start],
  ["turn", turn],
]);

const snapshot = SCENES.get(params.get("scene") ?? "") ?? showdown;

const before: TableSnapshot = {
  ...start,
  buttonSeat: (BUTTON_AT - 1 + players) % players,
  handId: 7,
  posts: [],
  seats: start.seats.map((seat) => ({ ...seat, bet: 0 })),
};

const theme = params.get("theme");

if (theme === "dark" || theme === "light") {
  document.documentElement.dataset.theme = theme;
}

interface TableHost extends HTMLElement {
  snapshot: TableSnapshot | null;
  sound: boolean;
}

const isTableHost = (node: Element): node is TableHost =>
  node.tagName.toLowerCase() === TABLE_TAG;

const element = (tag: string, className: string, text = "") => {
  const node = document.createElement(tag);

  node.className = className;
  node.textContent = text;

  return node;
};

const definedLate = params.get("late") === "1";

const NEXT_HAND_EVENT = "stage:next-hand";

if (params.get("deck") === "four") {
  document.documentElement.dataset.deck = "four";
}

const mount = () => {
  if (!definedLate) {
    defineTable();
  }

  const root = document.querySelector("#stage");
  const page = element("main", "page room");
  const header = element("header", "room-header");
  const body = element("div", "room-body");
  const stage = element("div", "table-stage");
  const table = document.createElement(TABLE_TAG);

  if (root === null || !isTableHost(table)) {
    throw new Error("The layout stage needs a #stage element and the table.");
  }

  table.className = "table-host";
  table.sound = false;
  const end = element("span", "bar-end");
  const face = element("span", "bar-button face-button");

  face.innerHTML = render(randomAvatar(17), {
    expression: "Resting",
    size: 32,
  });
  end.append(face, element("span", "bar-button", "Menu"));
  header.append(
    element("span", "brand small", "nostakes"),
    element("span", "bar-button", "Invite"),
    end
  );
  stage.append(table);
  body.append(stage);
  page.append(header, body);
  root.append(page);
  const travel = params.get("travel") === "1";

  const from = params.get("scene") === "hand" ? handFrom : undefined;

  table.snapshot = travel ? before : (from ?? snapshot);

  if (travel) {
    document.addEventListener(
      NEXT_HAND_EVENT,
      () => {
        table.snapshot = snapshot;
      },
      { once: true }
    );
  }

  if (definedLate) {
    defineTable();
  }

  const told = TOLD.get(params.get("scene") ?? "") ?? [];

  if (told.length > 0) {
    requestAnimationFrame(() => {
      table.snapshot = {
        ...snapshot,
        events: told.map((happening, index) => ({ happening, id: index + 1 })),
      };
    });
  }

  document.documentElement.dataset.staged = "true";
};

mount();
