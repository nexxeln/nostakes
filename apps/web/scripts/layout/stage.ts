import { codeFor, randomAvatar } from "@nostakes/avatar";

import "../../src/client/tokens.css";
import "../../src/client/app.css";
import { defineTable } from "../../src/client/table/element.js";
import { TABLE_TAG } from "../../src/features/table/snapshot.js";
import type {
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
  afterHand: { bothOnly: false, rabbit: false, showable: [] },
  bigBlind: 20,
  boards: BOARDS.slice(0, boards),
  buttonSeat: 2,
  clock: null,
  events: [],
  handId: 7,
  heroCards: SHOWN[0] ?? [],
  heroSeat: 0,
  hostTools: false,
  learned: ["Peek", "Fold", "Raise", "Keys"],
  legal: null,
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

const snapshot = params.get("scene") === "turn" ? turn : showdown;

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
  header.append(element("span", "brand small", "nostakes"));
  stage.append(table);
  body.append(stage);
  page.append(header, body);
  root.append(page);
  table.snapshot = snapshot;

  if (definedLate) {
    defineTable();
  }

  document.documentElement.dataset.staged = "true";
};

mount();
