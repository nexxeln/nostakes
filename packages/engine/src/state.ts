import { Data, Option, Schema } from "effect";

import type { Card } from "./cards.js";
import type { Chips, PlayerId, SeatIndex } from "./primitives.js";
import { SEAT_COUNT } from "./primitives.js";
import type { TableConfig } from "./rules.js";

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
  readonly revealed: readonly Card[];
  readonly seat: SeatIndex;
  readonly status: PlayerStatus;
}

export interface RunChoice {
  readonly runs: number;
  readonly seat: SeatIndex;
}

export type Phase = Data.TaggedEnum<{
  Betting: {
    readonly currentBet: Chips;
    readonly lastAggressor: Option.Option<SeatIndex>;
    readonly lastFullRaise: Chips;
    readonly respondedTo: readonly Option.Option<Chips>[];
    readonly toAct: SeatIndex;
  };
  ChoosingRuns: {
    readonly choices: readonly RunChoice[];
    readonly maxRuns: number;
    readonly pending: readonly SeatIndex[];
  };
  Settling: {
    readonly lastAggressor: Option.Option<SeatIndex>;
  };
}>;

export const Phases = Data.taggedEnum<Phase>();

export type Betting = Data.TaggedEnum.Value<Phase, "Betting">;

export type ChoosingRuns = Data.TaggedEnum.Value<Phase, "ChoosingRuns">;

export interface ForcedBet {
  readonly amount: Chips;
  readonly seat: SeatIndex;
}

export interface Hand {
  readonly bigBlindSeat: SeatIndex;
  readonly boards: readonly (readonly Card[])[];
  readonly deadMoney: Chips;
  readonly deck: readonly Card[];
  readonly lastForcedBet: Option.Option<ForcedBet>;
  readonly paidOut: Chips;
  readonly phase: Phase;
  readonly players: readonly HandPlayer[];
  readonly smallBlindSeat: SeatIndex;
  readonly street: Street;
}

export interface LastHandPlayer {
  readonly holeCards: readonly Card[];
  readonly player: PlayerId;
  readonly revealed: readonly Card[];
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
    readonly button: Option.Option<SeatIndex>;
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

export const handPlayerAt = (hand: Hand, seat: SeatIndex) =>
  Option.fromUndefinedOr(hand.players.find((player) => player.seat === seat));

export const replaceSeat = (
  seats: readonly Seat[],
  seat: SeatIndex,
  replacement: Seat
) => seats.map((current, index) => (index === seat ? replacement : current));
