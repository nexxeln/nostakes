import { Unbalanced } from "@nostakes/ledger";
import { Schema } from "effect";

import { ActionNotOnSeat } from "./rejections/action-not-on-seat.js";
import { AlreadyAMember } from "./rejections/already-a-member.js";
import { AlreadyLeaving } from "./rejections/already-leaving.js";
import { AlreadySeated } from "./rejections/already-seated.js";
import { AlreadyTheHost } from "./rejections/already-the-host.js";
import { BeaconRejected } from "./rejections/beacon-rejected.js";
import { BeaconRoundWrong } from "./rejections/beacon-round-wrong.js";
import { BuyInOutOfRange } from "./rejections/buy-in-out-of-range.js";
import { ChipRequestPending } from "./rejections/chip-request-pending.js";
import { ChipsOverMax } from "./rejections/chips-over-max.js";
import { ClockNotDue } from "./rejections/clock-not-due.js";
import { CloseAlreadyQueued } from "./rejections/close-already-queued.js";
import { DealNotDue } from "./rejections/deal-not-due.js";
import { DealingIsAutomatic } from "./rejections/dealing-is-automatic.js";
import { GameAlready } from "./rejections/game-already.js";
import { HostStillHere } from "./rejections/host-still-here.js";
import { MembersOnly } from "./rejections/members-only.js";
import { NameTaken } from "./rejections/name-taken.js";
import { NoChipRequest } from "./rejections/no-chip-request.js";
import { NoSeatRequest } from "./rejections/no-seat-request.js";
import { NoSuchDeadline } from "./rejections/no-such-deadline.js";
import { NotAMember } from "./rejections/not-a-member.js";
import { NotSeated } from "./rejections/not-seated.js";
import { NotTheHost } from "./rejections/not-the-host.js";
import { NothingSealed } from "./rejections/nothing-sealed.js";
import { QueueNotDue } from "./rejections/queue-not-due.js";
import { QuietNotDue } from "./rejections/quiet-not-due.js";
import { RoomIsClosed } from "./rejections/room-is-closed.js";
import { SaltSecretSize } from "./rejections/salt-secret-size.js";
import { SealNotDue } from "./rejections/seal-not-due.js";
import { SealRoundTooSoon } from "./rejections/seal-round-too-soon.js";
import { SealedSeatsMoved } from "./rejections/sealed-seats-moved.js";
import { SeatBeyondTable } from "./rejections/seat-beyond-table.js";
import { SeatNotFree } from "./rejections/seat-not-free.js";
import { SeatRequestPending } from "./rejections/seat-request-pending.js";
import { SeatsStillTaken } from "./rejections/seats-still-taken.js";
import { ServerOnly } from "./rejections/server-only.js";
import { SettlesAfterHand } from "./rejections/settles-after-hand.js";
import { ShuffleRanOut } from "./rejections/shuffle-ran-out.js";
import { TableRejected } from "./rejections/table-rejected.js";
import { TopUpNotAllowed } from "./rejections/top-up-not-allowed.js";

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
  DealingIsAutomatic,
  GameAlready,
  HostStillHere,
  MembersOnly,
  NameTaken,
  NoChipRequest,
  NoSeatRequest,
  NoSuchDeadline,
  NotAMember,
  NotSeated,
  NotTheHost,
  RoomIsClosed,
  SeatBeyondTable,
  SeatNotFree,
  SeatRequestPending,
  SeatsStillTaken,
  ServerOnly,
  SettlesAfterHand,
  ShuffleRanOut,
  TableRejected,
  TopUpNotAllowed,
  Unbalanced,
  BeaconRejected,
  BeaconRoundWrong,
  NothingSealed,
  SaltSecretSize,
  SealNotDue,
  SealRoundTooSoon,
  SealedSeatsMoved,
  QueueNotDue,
  QuietNotDue,
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

export { DealingIsAutomatic } from "./rejections/dealing-is-automatic.js";

export { GameAlready } from "./rejections/game-already.js";

export { HostStillHere } from "./rejections/host-still-here.js";

export { MembersOnly } from "./rejections/members-only.js";

export { NameTaken } from "./rejections/name-taken.js";

export { NoChipRequest } from "./rejections/no-chip-request.js";

export { NoSeatRequest } from "./rejections/no-seat-request.js";

export { NoSuchDeadline } from "./rejections/no-such-deadline.js";

export { NotAMember } from "./rejections/not-a-member.js";

export { NotSeated } from "./rejections/not-seated.js";

export { NotTheHost } from "./rejections/not-the-host.js";

export { RoomIsClosed } from "./rejections/room-is-closed.js";

export { SeatBeyondTable } from "./rejections/seat-beyond-table.js";

export { SeatNotFree } from "./rejections/seat-not-free.js";

export { SeatRequestPending } from "./rejections/seat-request-pending.js";

export { SeatsStillTaken } from "./rejections/seats-still-taken.js";

export { ServerOnly } from "./rejections/server-only.js";

export { SettlesAfterHand } from "./rejections/settles-after-hand.js";

export { ShuffleRanOut } from "./rejections/shuffle-ran-out.js";

export { TableRejected } from "./rejections/table-rejected.js";

export { TopUpNotAllowed } from "./rejections/top-up-not-allowed.js";

export { BeaconRejected } from "./rejections/beacon-rejected.js";

export { BeaconRoundWrong } from "./rejections/beacon-round-wrong.js";

export { NothingSealed } from "./rejections/nothing-sealed.js";

export { SaltSecretSize } from "./rejections/salt-secret-size.js";

export { SealNotDue } from "./rejections/seal-not-due.js";

export { SealRoundTooSoon } from "./rejections/seal-round-too-soon.js";

export { SealedSeatsMoved } from "./rejections/sealed-seats-moved.js";

export { QueueNotDue } from "./rejections/queue-not-due.js";

export { QuietNotDue } from "./rejections/quiet-not-due.js";

export { Unbalanced } from "@nostakes/ledger";
