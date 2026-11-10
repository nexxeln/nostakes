import { Data, Option, Schema } from "effect";

import type { Card } from "./cards.js";
import type { Chips, PlayerId, SeatIndex } from "./primitives.js";
import { SEAT_COUNT, chips } from "./primitives.js";
import type { RunCount, TableConfig } from "./rules.js";
import type { ShowdownEntry } from "./showdown.js";

export const StreetSchema = Schema.Literals([
  "Preflop",
  "Flop",
  "Turn",
  "River",
]);

export type Street = typeof StreetSchema.Type;

export interface EmptySeat {
  readonly _tag: "Empty";
}

export interface Occupied {
  readonly _tag: "Occupied";
  readonly player: PlayerId;
  readonly sittingOut: boolean;
  readonly stack: Chips;
}

export type Seat = EmptySeat | Occupied;

export const Seats = Data.taggedEnum<Seat>();

export const EMPTY_SEAT = Seats.Empty();

export const isOccupied = Seats.$is("Occupied");

export type PlayerStatus = "Active" | "AllIn" | "Folded";

export interface HandPlayer {
  readonly committedThisStreet: Chips;
  readonly committedTotal: Chips;
  readonly holeCards: readonly Card[];
  readonly mucked: boolean;
  readonly player: PlayerId;
  readonly publicCards: readonly Card[];
  readonly seat: SeatIndex;
  readonly status: PlayerStatus;
  readonly won: Chips;
}

export interface RunChoice {
  readonly runs: RunCount;
  readonly seat: SeatIndex;
}

export interface Round {
  readonly actedAt: readonly Option.Option<Chips>[];
  readonly currentBet: Chips;
  readonly lastAggressor: Option.Option<SeatIndex>;
  readonly lastFullRaise: Chips;
}

export type Phase = Data.TaggedEnum<{
  Betting: Round & { readonly toAct: SeatIndex };
  ChoosingRuns: {
    readonly choices: readonly RunChoice[];
    readonly maxRuns: RunCount;
    readonly pending: readonly SeatIndex[];
  };
  RunningOut: { readonly runs: readonly (readonly Card[])[] };
  Settling: { readonly lastAggressor: Option.Option<SeatIndex> };
  ShowingDown: {
    readonly entries: readonly ShowdownEntry[];
    readonly order: readonly SeatIndex[];
    readonly toAct: Option.Option<SeatIndex>;
  };
}>;

export const Phases = Data.taggedEnum<Phase>();

export type Betting = Data.TaggedEnum.Value<Phase, "Betting">;

export type ChoosingRuns = Data.TaggedEnum.Value<Phase, "ChoosingRuns">;

export type ShowingDown = Data.TaggedEnum.Value<Phase, "ShowingDown">;

export interface Straddle {
  readonly amount: Chips;
  readonly seat: SeatIndex;
}

export interface Hand {
  readonly aggressor: Option.Option<SeatIndex>;
  readonly bigBlindSeat: SeatIndex;
  readonly board: readonly Card[];
  readonly deadMoney: Chips;
  readonly deck: readonly Card[];
  readonly phase: Phase;
  readonly players: readonly HandPlayer[];
  readonly smallBlindSeat: SeatIndex;
  readonly straddles: readonly Straddle[];
  readonly street: Street;
}

export interface LastHandPlayer {
  readonly holeCards: readonly Card[];
  readonly player: PlayerId;
  readonly publicCards: readonly Card[];
  readonly seat: SeatIndex;
}

export interface LastHand {
  readonly hunted: boolean;
  readonly players: readonly LastHandPlayer[];
  readonly undealt: readonly Card[];
}

export type TableState = Data.TaggedEnum<{
  BetweenHands: {
    readonly button: Option.Option<SeatIndex>;
    readonly config: TableConfig;
    readonly handNumber: number;
    readonly lastHand: Option.Option<LastHand>;
    readonly seats: readonly Seat[];
  };
  InHand: {
    readonly button: SeatIndex;
    readonly config: TableConfig;
    readonly hand: Hand;
    readonly handNumber: number;
    readonly seats: readonly Seat[];
  };
}>;

export const TableStates = Data.taggedEnum<TableState>();

export type BetweenHands = Data.TaggedEnum.Value<TableState, "BetweenHands">;

export type InHand = Data.TaggedEnum.Value<TableState, "InHand">;

export const isInHand = TableStates.$is("InHand");

export const initialTable = (config: TableConfig): TableState =>
  TableStates.BetweenHands({
    button: Option.none(),
    config,
    handNumber: 0,
    lastHand: Option.none(),
    seats: Array.from({ length: SEAT_COUNT }, () => EMPTY_SEAT),
  });

export const seatAtIndex = (state: TableState, seat: SeatIndex) =>
  state.seats[seat] ?? EMPTY_SEAT;

export const occupantOf = (state: TableState, seat: SeatIndex) => {
  const occupant = seatAtIndex(state, seat);

  return isOccupied(occupant) ? Option.some(occupant) : Option.none();
};

export const stackOf = (state: TableState, seat: SeatIndex) => {
  const occupant = seatAtIndex(state, seat);

  return isOccupied(occupant) ? occupant.stack : 0;
};

export const handPlayerAt = (hand: Hand, seat: SeatIndex) =>
  Option.fromUndefinedOr(hand.players.find((player) => player.seat === seat));

export const replaceSeat = (
  seats: readonly Seat[],
  seat: SeatIndex,
  replacement: Seat
) => seats.map((current, index) => (index === seat ? replacement : current));

export const updatePlayer = (
  hand: Hand,
  seat: SeatIndex,
  update: (player: HandPlayer) => HandPlayer
): Hand => ({
  ...hand,
  players: hand.players.map((player) =>
    player.seat === seat ? update(player) : player
  ),
});

export const notFolded = (hand: Hand) =>
  hand.players.filter((player) => player.status !== "Folded");

export const activePlayers = (hand: Hand) =>
  hand.players.filter((player) => player.status === "Active");

export const playersClockwiseAfter = (
  players: readonly HandPlayer[],
  seat: SeatIndex
) => [
  ...players.filter((player) => player.seat > seat),
  ...players.filter((player) => player.seat <= seat),
];

export const withStackChange = (
  seats: readonly Seat[],
  seat: SeatIndex,
  change: number
) =>
  seats.map((current, index) =>
    index === seat && isOccupied(current)
      ? { ...current, stack: chips(current.stack + change) }
      : current
  );

export const withHand = (state: InHand, hand: Hand): InHand => ({
  ...state,
  hand,
});

export const whenInHand = (
  state: TableState,
  update: (inHand: InHand) => TableState
) => (isInHand(state) ? update(state) : state);

export const commit = (
  state: InHand,
  seat: SeatIndex,
  amount: Chips,
  live: boolean
): InHand => {
  const seats = withStackChange(state.seats, seat, 0 - amount);
  const allIn = stackOf({ ...state, seats }, seat) === 0;

  return {
    ...state,
    hand: updatePlayer(state.hand, seat, (player) => ({
      ...player,
      committedThisStreet: live
        ? chips(player.committedThisStreet + amount)
        : player.committedThisStreet,
      committedTotal: chips(player.committedTotal + amount),
      status: allIn ? "AllIn" : player.status,
    })),
    seats,
  };
};
