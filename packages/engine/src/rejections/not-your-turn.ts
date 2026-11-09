import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class NotYourTurn extends Schema.TaggedError<
  NotYourTurn,
  { readonly brand: unique symbol }
>()("NotYourTurn", { seat: SeatIndexSchema, toAct: SeatIndexSchema }) {
  override get message() {
    return `Seat ${this.seat} cannot act now because seat ${this.toAct} is to act. Wait for your turn.`;
  }
}
