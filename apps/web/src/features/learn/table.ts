import {
  BIG_BLIND,
  BIG_BLIND_SEAT,
  SEATS,
  SMALL_BLIND,
  SMALL_BLIND_SEAT,
  STARTING_STACK,
} from "./lesson.js";
import type { Move, Seat, Street } from "./lesson.js";

type Amounts = Readonly<Record<Seat, number>>;

type Words = Readonly<Record<Seat, string>>;

export interface Won {
  readonly amount: number;
  readonly seat: Seat;
}

export interface Table {
  readonly bets: Amounts;
  readonly board: number;
  readonly folded: readonly Seat[];
  readonly posted: Words;
  readonly pot: number;
  readonly said: Words;
  readonly shown: readonly Seat[];
  readonly stacks: Amounts;
  readonly won: Won | undefined;
}

const SILENT: Words = { bo: "", jonas: "", mara: "", you: "" };

const NOTHING: Amounts = { bo: 0, jonas: 0, mara: 0, you: 0 };

const CARDS_AFTER: Readonly<Record<Street, number>> = {
  Flop: 3,
  River: 5,
  Turn: 4,
};

export const chipsText = (amount: number) =>
  Math.trunc(amount).toLocaleString("en-US");

const FULL: Amounts = {
  bo: STARTING_STACK,
  jonas: STARTING_STACK,
  mara: STARTING_STACK,
  you: STARTING_STACK,
};

export const DEALT: Table = {
  bets: {
    ...NOTHING,
    [BIG_BLIND_SEAT]: BIG_BLIND,
    [SMALL_BLIND_SEAT]: SMALL_BLIND,
  },
  board: 0,
  folded: [],
  posted: { ...SILENT, [BIG_BLIND_SEAT]: "BB", [SMALL_BLIND_SEAT]: "SB" },
  pot: 0,
  said: SILENT,
  shown: [],
  stacks: {
    ...FULL,
    [BIG_BLIND_SEAT]: STARTING_STACK - BIG_BLIND,
    [SMALL_BLIND_SEAT]: STARTING_STACK - SMALL_BLIND,
  },
  won: undefined,
};

export const UNDEALT: Table = {
  ...DEALT,
  bets: NOTHING,
  posted: SILENT,
  stacks: FULL,
};

const total = (amounts: Amounts) =>
  amounts.bo + amounts.jonas + amounts.mara + amounts.you;

const highest = (amounts: Amounts) =>
  Math.max(...SEATS.map((seat) => amounts[seat]));

export const toCall = (table: Table, seat: Seat) =>
  Math.min(highest(table.bets) - table.bets[seat], table.stacks[seat]);

export const liveSeats = (table: Table) =>
  SEATS.filter((seat) => !table.folded.includes(seat));

const putIn = (
  table: Table,
  seat: Seat,
  added: number,
  words: string
): Table => ({
  ...table,
  bets: { ...table.bets, [seat]: table.bets[seat] + added },
  posted: { ...table.posted, [seat]: "" },
  said: { ...table.said, [seat]: words },
  stacks: { ...table.stacks, [seat]: table.stacks[seat] - added },
});

const betWords = (table: Table, seat: Seat, to: number) => {
  if (to - table.bets[seat] >= table.stacks[seat]) {
    return "All in";
  }

  return highest(table.bets) === 0
    ? `Bet ${chipsText(to)}`
    : `Raise to ${chipsText(to)}`;
};

const uncalled = (table: Table, seat: Seat) => {
  const others = SEATS.filter((other) => other !== seat).map(
    (other) => table.bets[other]
  );

  return Math.max(0, table.bets[seat] - Math.max(...others));
};

const awarded = (table: Table, seat: Seat): Table => {
  const back = uncalled(table, seat);
  const amount = table.pot + total(table.bets) - back;

  return {
    ...table,
    bets: NOTHING,
    posted: SILENT,
    pot: 0,
    stacks: { ...table.stacks, [seat]: table.stacks[seat] + amount + back },
    won: { amount, seat },
  };
};

const settled = (table: Table): Table => {
  const [alone, ...others] = liveSeats(table);

  return alone !== undefined && others.length === 0 && table.won === undefined
    ? awarded(table, alone)
    : table;
};

const quiet = (table: Table): Words => ({
  bo: table.folded.includes("bo") ? table.said.bo : "",
  jonas: table.folded.includes("jonas") ? table.said.jonas : "",
  mara: table.folded.includes("mara") ? table.said.mara : "",
  you: table.folded.includes("you") ? table.said.you : "",
});

const gathered = (table: Table): Table => ({
  ...table,
  bets: NOTHING,
  posted: SILENT,
  pot: table.pot + total(table.bets),
  said: quiet(table),
});

export const afterMove = (table: Table, move: Move): Table => {
  if (move.kind === "Bet") {
    return putIn(
      table,
      move.seat,
      move.to - table.bets[move.seat],
      betWords(table, move.seat, move.to)
    );
  }

  if (move.kind === "Call") {
    const owed = toCall(table, move.seat);

    return putIn(
      table,
      move.seat,
      owed,
      owed >= table.stacks[move.seat]
        ? "All in"
        : `Call ${chipsText(highest(table.bets))}`
    );
  }

  if (move.kind === "Check") {
    return {
      ...table,
      posted: { ...table.posted, [move.seat]: "" },
      said: { ...table.said, [move.seat]: "Check" },
    };
  }

  if (move.kind === "Fold") {
    return settled({
      ...table,
      folded: [...table.folded, move.seat],
      posted: { ...table.posted, [move.seat]: "" },
      said: { ...table.said, [move.seat]: "Fold" },
    });
  }

  if (move.kind === "Show") {
    return { ...table, shown: [...table.shown, move.seat] };
  }

  if (move.kind === "Street") {
    return { ...gathered(table), board: CARDS_AFTER[move.street] };
  }

  return awarded({ ...gathered(table), shown: liveSeats(table) }, move.winner);
};

export const afterMoves = (table: Table, moves: readonly Move[]) => {
  let current = table;

  for (const move of moves) {
    current = afterMove(current, move);
  }

  return current;
};
