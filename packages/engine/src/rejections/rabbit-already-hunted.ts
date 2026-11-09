import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class RabbitAlreadyHunted extends Schema.TaggedError<
  RabbitAlreadyHunted,
  { readonly brand: unique symbol }
>()("RabbitAlreadyHunted", { seat: SeatIndexSchema }) {
  override get message() {
    return `Seat ${this.seat} asked for a rabbit hunt, but the cards that would have come are already face up. Everyone can see them now.`;
  }
}
