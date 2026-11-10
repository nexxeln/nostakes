import { Schema } from "effect";

import { AlreadyAMember } from "./rejections/already-a-member.js";
import { AlreadySeated } from "./rejections/already-seated.js";
import { AlreadyTheHost } from "./rejections/already-the-host.js";
import { BuyInOutOfRange } from "./rejections/buy-in-out-of-range.js";
import { ChipRequestPending } from "./rejections/chip-request-pending.js";
import { ChipsOverMax } from "./rejections/chips-over-max.js";
import { DealNotDue } from "./rejections/deal-not-due.js";
import { GameAlready } from "./rejections/game-already.js";
import { MembersOnly } from "./rejections/members-only.js";
import { NoChipRequest } from "./rejections/no-chip-request.js";
import { NoSeatRequest } from "./rejections/no-seat-request.js";
import { NotAMember } from "./rejections/not-a-member.js";
import { NotSeated } from "./rejections/not-seated.js";
import { NotTheHost } from "./rejections/not-the-host.js";
import { RoomIsClosed } from "./rejections/room-is-closed.js";
import { SeatNotFree } from "./rejections/seat-not-free.js";
import { SeatRequestPending } from "./rejections/seat-request-pending.js";
import { ServerOnly } from "./rejections/server-only.js";
import { ShuffleRanOut } from "./rejections/shuffle-ran-out.js";
import { TableRejected } from "./rejections/table-rejected.js";

export const RoomRejectionSchema = Schema.Union([
  AlreadyAMember,
  AlreadySeated,
  AlreadyTheHost,
  BuyInOutOfRange,
  ChipRequestPending,
  ChipsOverMax,
  DealNotDue,
  GameAlready,
  MembersOnly,
  NoChipRequest,
  NoSeatRequest,
  NotAMember,
  NotSeated,
  NotTheHost,
  RoomIsClosed,
  SeatNotFree,
  SeatRequestPending,
  ServerOnly,
  ShuffleRanOut,
  TableRejected,
]);

export type RoomRejection = typeof RoomRejectionSchema.Type;

export { AlreadyAMember } from "./rejections/already-a-member.js";

export { AlreadySeated } from "./rejections/already-seated.js";

export { AlreadyTheHost } from "./rejections/already-the-host.js";

export { BuyInOutOfRange } from "./rejections/buy-in-out-of-range.js";

export { ChipRequestPending } from "./rejections/chip-request-pending.js";

export { ChipsOverMax } from "./rejections/chips-over-max.js";

export { DealNotDue } from "./rejections/deal-not-due.js";

export { GameAlready } from "./rejections/game-already.js";

export { MembersOnly } from "./rejections/members-only.js";

export { NoChipRequest } from "./rejections/no-chip-request.js";

export { NoSeatRequest } from "./rejections/no-seat-request.js";

export { NotAMember } from "./rejections/not-a-member.js";

export { NotSeated } from "./rejections/not-seated.js";

export { NotTheHost } from "./rejections/not-the-host.js";

export { RoomIsClosed } from "./rejections/room-is-closed.js";

export { SeatNotFree } from "./rejections/seat-not-free.js";

export { SeatRequestPending } from "./rejections/seat-request-pending.js";

export { ServerOnly } from "./rejections/server-only.js";

export { ShuffleRanOut } from "./rejections/shuffle-ran-out.js";

export { TableRejected } from "./rejections/table-rejected.js";
