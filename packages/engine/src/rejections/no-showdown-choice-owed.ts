import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class NoShowdownChoiceOwed extends Schema.TaggedError<
  NoShowdownChoiceOwed,
  { readonly brand: unique symbol }
>()("NoShowdownChoiceOwed", { seat: SeatIndexSchema }) {
  override get message() {
    return `Seat ${this.seat} has no showdown choice to make right now. Send TableHand or MuckHand only when pendingDecisions asks this seat to show.`;
  }
}
