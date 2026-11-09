import { Schema } from "effect";

import { PlayerIdSchema, SeatIndexSchema } from "../primitives.js";

export class SeatTaken extends Schema.TaggedError<SeatTaken>()("SeatTaken", {
  occupant: PlayerIdSchema,
  seat: SeatIndexSchema,
}) {
  override get message() {
    return `Seat ${this.seat} is taken by ${this.occupant}. Choose an empty seat.`;
  }
}
