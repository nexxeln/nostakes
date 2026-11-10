import {
  SEAT_COUNT,
  SeatIndexSchema,
  Seats,
  TableStates,
} from "@nostakes/engine";
import type {
  Card,
  Chips,
  PlayerId,
  Seat,
  SeatIndex,
  TableConfig,
  TableState,
} from "@nostakes/engine";
import type { LedgerEntry } from "@nostakes/ledger";
import { Data, Option, Result } from "effect";

import type { RoomCode } from "./identity.js";
import { NotSeated } from "./rejection.js";
import type { RoomSettings } from "./settings.js";
import type { Settlement } from "./settlement.js";
import type { Millis } from "./time.js";

export interface Member {
  readonly avatar: string;
  readonly joinedAt: Millis;
  readonly name: string;
  readonly player: PlayerId;
}

export interface SeatRequest {
  readonly buyIn: Chips;
  readonly player: PlayerId;
  readonly seat: SeatIndex;
}

export interface ChipRequest {
  readonly amount: Chips;
  readonly player: PlayerId;
}

export interface Requests {
  readonly chips: readonly ChipRequest[];
  readonly seats: readonly SeatRequest[];
}

export interface Queue {
  readonly chips: readonly ChipRequest[];
  readonly close: boolean;
  readonly leaving: readonly PlayerId[];
  readonly rules: Option.Option<TableConfig>;
}

export type DecisionClock = Data.TaggedEnum<{
  RunChoice: { readonly deadline: Millis };
  Turn: {
    readonly bankFrom: Option.Option<Millis>;
    readonly deadline: Millis;
    readonly player: PlayerId;
    readonly seat: SeatIndex;
  };
}>;

export const DecisionClocks = Data.taggedEnum<DecisionClock>();

export interface Clocks {
  readonly bankSpent: ReadonlyMap<PlayerId, number>;
  readonly decision: Option.Option<DecisionClock>;
  readonly lastHandEndedAt: Option.Option<Millis>;
}

export interface Award {
  readonly amount: Chips;
  readonly eligible: readonly SeatIndex[];
  readonly pot: number;
  readonly run: number;
  readonly winners: readonly {
    readonly amount: Chips;
    readonly seat: SeatIndex;
  }[];
}

export interface HandRecord {
  readonly awards: readonly Award[];
  readonly boards: readonly (readonly Card[])[];
  readonly handNumber: number;
  readonly mucked: readonly SeatIndex[];
  readonly rabbit: readonly Card[];
}

export type Game = "Running" | "Waiting";

export type Entries = ReadonlyMap<PlayerId, readonly LedgerEntry<PlayerId>[]>;

export type RoomState = Data.TaggedEnum<{
  Closed: {
    readonly code: RoomCode;
    readonly entries: Entries;
    readonly members: readonly Member[];
    readonly now: Millis;
    readonly settlement: Settlement;
  };
  Open: {
    readonly away: readonly SeatIndex[];
    readonly clocks: Clocks;
    readonly code: RoomCode;
    readonly entries: Entries;
    readonly game: Game;
    readonly host: PlayerId;
    readonly members: readonly Member[];
    readonly now: Millis;
    readonly queued: Queue;
    readonly record: Option.Option<HandRecord>;
    readonly requests: Requests;
    readonly settings: RoomSettings;
    readonly straddlers: readonly PlayerId[];
    readonly table: TableState;
  };
}>;

export const RoomStates = Data.taggedEnum<RoomState>();

export type Open = Data.TaggedEnum.Value<RoomState, "Open">;

export type Closed = Data.TaggedEnum.Value<RoomState, "Closed">;

export const isOpen = RoomStates.$is("Open");

export const EMPTY_QUEUE: Queue = {
  chips: [],
  close: false,
  leaving: [],
  rules: Option.none(),
};

export const memberOf = (state: Open | Closed, player: PlayerId) =>
  Option.fromUndefinedOr(
    state.members.find((member) => member.player === player)
  );

export const isMember = (state: Open | Closed, player: PlayerId) =>
  state.members.some((member) => member.player === player);

export const SEATS: readonly SeatIndex[] = Array.from(
  { length: SEAT_COUNT },
  (_, index) => SeatIndexSchema.make(index)
);

export type Occupant = Extract<Seat, { readonly _tag: "Occupied" }>;

export const occupantAt = (
  table: TableState,
  seat: SeatIndex
): Option.Option<Occupant> =>
  Option.fromUndefinedOr(table.seats[seat]).pipe(
    Option.filter(Seats.$is("Occupied"))
  );

export const seatOf = (state: Open, player: PlayerId) =>
  Option.fromUndefinedOr(
    SEATS.find((seat) =>
      Option.exists(
        occupantAt(state.table, seat),
        (occupant) => occupant.player === player
      )
    )
  );

export const handInProgress = (state: Open) =>
  TableStates.$is("InHand")(state.table);

export const heldSeat = (state: Open, player: PlayerId) =>
  Option.match(seatOf(state, player), {
    onNone: () => Result.fail(new NotSeated({ player })),
    onSome: (seat) => Result.succeed(seat),
  });
