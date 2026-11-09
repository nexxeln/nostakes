import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class SeatInHand extends Schema.TaggedError<
  SeatInHand,
  { readonly brand: unique symbol }
>()("SeatInHand", {
  seat: SeatIndexSchema,
}) {
  override get message() {
    return `Seat ${this.seat} is dealt into the current hand. Send this again after the hand ends.`;
  }
}
