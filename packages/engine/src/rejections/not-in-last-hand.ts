import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class NotInLastHand extends Schema.TaggedError<
  NotInLastHand,
  { readonly brand: unique symbol }
>()("NotInLastHand", { seat: SeatIndexSchema }) {
  override get message() {
    return `Seat ${this.seat} was not dealt into the hand that just ended, or that hand is no longer the last one. Only a player dealt into the last hand may do this, and only until the next deal.`;
  }
}
