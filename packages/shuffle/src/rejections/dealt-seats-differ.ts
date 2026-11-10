import { Schema } from "effect";

import { SeatSchema } from "../schemas.js";

const listed = (seats: readonly number[]) => seats.join(", ");

export class DealtSeatsDiffer extends Schema.TaggedError<
  DealtSeatsDiffer,
  { readonly brand: unique symbol }
>()("DealtSeatsDiffer", {
  dealt: Schema.Array(SeatSchema),
  sealed: Schema.Array(SeatSchema),
}) {
  override get message() {
    return `The seal said seats ${listed(this.sealed)} would be dealt in, in that order, and the hand was dealt to seats ${listed(this.dealt)}. Changing who is dealt in after the beacon is known changes every player's cards, so the server could pick among deals that way.`;
  }
}
