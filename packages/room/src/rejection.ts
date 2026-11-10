import { Unbalanced } from "@nostakes/ledger";
import { Schema } from "effect";

import { ActionNotOnSeat } from "./rejections/action-not-on-seat.js";
import { AlreadyAMember } from "./rejections/already-a-member.js";
import { AlreadyLeaving } from "./rejections/already-leaving.js";
import { AlreadySeated } from "./rejections/already-seated.js";
import { AlreadyTheHost } from "./rejections/already-the-host.js";
import { BuyInOutOfRange } from "./rejections/buy-in-out-of-range.js";
import { ChipRequestPending } from "./rejections/chip-request-pending.js";
import { ChipsOverMax } from "./rejections/chips-over-max.js";
import { ClockNotDue } from "./rejections/clock-not-due.js";
import { CloseAlreadyQueued } from "./rejections/close-already-queued.js";
import { DealNotDue } from "./rejections/deal-not-due.js";
import { GameAlready } from "./rejections/game-already.js";
import { MembersOnly } from "./rejections/members-only.js";
import { NoChipRequest } from "./rejections/no-chip-request.js";
import { NoSeatRequest } from "./rejections/no-seat-request.js";
import { NoSuchDeadline } from "./rejections/no-such-deadline.js";
import { NotAMember } from "./rejections/not-a-member.js";
import { NotSeated } from "./rejections/not-seated.js";
import { NotTheHost } from "./rejections/not-the-host.js";
import { RoomIsClosed } from "./rejections/room-is-closed.js";
import { SeatNotFree } from "./rejections/seat-not-free.js";
import { SeatRequestPending } from "./rejections/seat-request-pending.js";
import { ServerOnly } from "./rejections/server-only.js";
import { SettlesAfterHand } from "./rejections/settles-after-hand.js";
import { ShuffleRanOut } from "./rejections/shuffle-ran-out.js";
import { TableRejected } from "./rejections/table-rejected.js";

export const RoomRejectionSchema = Schema.Union([
  ActionNotOnSeat,
  AlreadyAMember,
  AlreadyLeaving,
  AlreadySeated,
  AlreadyTheHost,
  BuyInOutOfRange,
  ChipRequestPending,
  ChipsOverMax,
  ClockNotDue,
  CloseAlreadyQueued,
  DealNotDue,
  GameAlready,
  MembersOnly,
  NoChipRequest,
  NoSeatRequest,
  NoSuchDeadline,
  NotAMember,
  NotSeated,
  NotTheHost,
  RoomIsClosed,
  SeatNotFree,
  SeatRequestPending,
  ServerOnly,
  SettlesAfterHand,
  ShuffleRanOut,
  TableRejected,
  Unbalanced,
]);

export type RoomRejection = typeof RoomRejectionSchema.Type;

export { ActionNotOnSeat } from "./rejections/action-not-on-seat.js";

export { AlreadyAMember } from "./rejections/already-a-member.js";

export { AlreadyLeaving } from "./rejections/already-leaving.js";

export { AlreadySeated } from "./rejections/already-seated.js";

export { AlreadyTheHost } from "./rejections/already-the-host.js";

export { BuyInOutOfRange } from "./rejections/buy-in-out-of-range.js";

export { ChipRequestPending } from "./rejections/chip-request-pending.js";

export { ChipsOverMax } from "./rejections/chips-over-max.js";

export { ClockNotDue } from "./rejections/clock-not-due.js";

export { CloseAlreadyQueued } from "./rejections/close-already-queued.js";

export { DealNotDue } from "./rejections/deal-not-due.js";

export { GameAlready } from "./rejections/game-already.js";

export { MembersOnly } from "./rejections/members-only.js";

export { NoChipRequest } from "./rejections/no-chip-request.js";

export { NoSeatRequest } from "./rejections/no-seat-request.js";

export { NoSuchDeadline } from "./rejections/no-such-deadline.js";

export { NotAMember } from "./rejections/not-a-member.js";

export { NotSeated } from "./rejections/not-seated.js";

export { NotTheHost } from "./rejections/not-the-host.js";

export { RoomIsClosed } from "./rejections/room-is-closed.js";

export { SeatNotFree } from "./rejections/seat-not-free.js";

export { SeatRequestPending } from "./rejections/seat-request-pending.js";

export { ServerOnly } from "./rejections/server-only.js";

export { SettlesAfterHand } from "./rejections/settles-after-hand.js";

export { ShuffleRanOut } from "./rejections/shuffle-ran-out.js";

export { TableRejected } from "./rejections/table-rejected.js";

export { Unbalanced } from "@nostakes/ledger";
