import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class RabbitHuntOff extends Schema.TaggedError<
  RabbitHuntOff,
  { readonly brand: unique symbol }
>()("RabbitHuntOff", { seat: SeatIndexSchema }) {
  override get message() {
    return `Seat ${this.seat} asked for a rabbit hunt, but this table does not allow one. Change the rules between hands to turn rabbit hunting on.`;
  }
}
