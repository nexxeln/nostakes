import { PlayerIdSchema, SeatIndexSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class AlreadySeated extends Schema.TaggedError<
  AlreadySeated,
  { readonly brand: unique symbol }
>()("AlreadySeated", { player: PlayerIdSchema, seat: SeatIndexSchema }) {
  override get message() {
    return `${this.player} already sits in seat ${this.seat}. Send LeaveSeat before taking another seat.`;
  }
}
