import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class SeatEmpty extends Schema.TaggedError<
  SeatEmpty,
  { readonly brand: unique symbol }
>()("SeatEmpty", {
  seat: SeatIndexSchema,
}) {
  override get message() {
    return `Seat ${this.seat} is empty. Send this command for an occupied seat.`;
  }
}
