import { PlayerIdSchema, SeatIndexSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class SeatRequestPending extends Schema.TaggedError<
  SeatRequestPending,
  { readonly brand: unique symbol }
>()("SeatRequestPending", { player: PlayerIdSchema, seat: SeatIndexSchema }) {
  override get message() {
    return `${this.player} already asked for seat ${this.seat}. Wait for the host to approve or deny it.`;
  }
}
