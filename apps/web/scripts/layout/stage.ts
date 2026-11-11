import { codeFor, randomAvatar, render } from "@nostakes/avatar";

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

const seatOf = (index: number): SeatSnapshot => {
  const shownAt = SHOWDOWN_SEATS.indexOf(index);
  const shown = shownAt === -1 ? [] : (SHOWN[shownAt] ?? []);

  return {
    avatar: codeFor(randomAvatar(index * 7919 + 17)),
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

const actor = Math.min(
  players - 1,
  Math.max(0, Number(params.get("actor") ?? "2"))
);

const actingSeat = (index: number): SeatSnapshot => {
  const folded = index === ACTING_FOLDED && index !== actor;

  return {
    ...seatOf(index),
    cardsHeld: folded ? 0 : 2,
    name: ACTING_NAMES[index] ?? `Seat ${index + 1}`,
    peeking: index === actor,
    shown: [],
    stack: ACTING_STACKS[index] ?? 1000,
    status: folded ? "Folded" : "In",
  };
};

const acting: TableSnapshot = {
  ...showdown,
  boards: [["Ah", "Kd", "7s", "2c"]],
  buttonSeat: 1 % players,
  clock: {
    key: `acting-${actor}`,
    remainingMs: 17_000,
    seat: actor,
    totalMs: 30_000,
  },
  heroCards: ["Ad", "Kh"],
  legal: actor === 0 ? turn.legal : null,
  pots: [960],
  seats: Array.from({ length: players }, (_, index) => actingSeat(index)),
  toAct: actor,
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

const TOLD = new Map<string, readonly Happening[]>([["bounty", bountyTold]]);

const SCENES = new Map<string, TableSnapshot>([
  ["acting", acting],
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

  table.snapshot = travel ? before : snapshot;

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
