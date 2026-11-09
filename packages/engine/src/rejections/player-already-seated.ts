import { Schema } from "effect";

import { PlayerIdSchema, SeatIndexSchema } from "../primitives.js";

export class PlayerAlreadySeated extends Schema.TaggedError<PlayerAlreadySeated>()(
  "PlayerAlreadySeated",
  { player: PlayerIdSchema, seat: SeatIndexSchema }
) {
  override get message() {
    return `${this.player} already sits in seat ${this.seat}. Stand up before taking another seat.`;
  }
}
