import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class FoldedSeatCannotHunt extends Schema.TaggedError<
  FoldedSeatCannotHunt,
  { readonly brand: unique symbol }
>()("FoldedSeatCannotHunt", { seat: SeatIndexSchema }) {
  override get message() {
    return `Seat ${this.seat} folded before the last hand ended, and this table lets only the seats still in at the end rabbit hunt. Ask one of them, or ask the host to let every seat dealt in hunt.`;
  }
}
