import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class NoBettingRound extends Schema.TaggedError<
  NoBettingRound,
  { readonly brand: unique symbol }
>()("NoBettingRound", { seat: SeatIndexSchema }) {
  override get message() {
    return `Seat ${this.seat} sent a betting action, but no seat is to bet right now. Send Act only when pendingDecisions names a seat to bet.`;
  }
}
