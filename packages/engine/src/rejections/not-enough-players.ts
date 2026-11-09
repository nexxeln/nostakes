import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class NotEnoughPlayers extends Schema.TaggedError<
  NotEnoughPlayers,
  { readonly brand: unique symbol }
>()("NotEnoughPlayers", { dealtIn: Schema.Array(SeatIndexSchema) }) {
  override get message() {
    return `Only ${this.dealtIn.length} seat(s) can be dealt in. A hand needs two occupied seats that hold chips and are not sitting out.`;
  }
}
