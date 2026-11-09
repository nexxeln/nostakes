import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class NoRunChoiceOwed extends Schema.TaggedError<
  NoRunChoiceOwed,
  { readonly brand: unique symbol }
>()("NoRunChoiceOwed", { seat: SeatIndexSchema }) {
  override get message() {
    return `Seat ${this.seat} owes no choice of how many times to run the board. Send ChooseRuns only when pendingDecisions lists this seat.`;
  }
}
