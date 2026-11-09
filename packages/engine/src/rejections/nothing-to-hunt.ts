import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class NothingToHunt extends Schema.TaggedError<
  NothingToHunt,
  { readonly brand: unique symbol }
>()("NothingToHunt", { seat: SeatIndexSchema }) {
  override get message() {
    return `Seat ${this.seat} asked for a rabbit hunt, but the last hand dealt the whole board. A rabbit hunt only reveals cards that never came.`;
  }
}
