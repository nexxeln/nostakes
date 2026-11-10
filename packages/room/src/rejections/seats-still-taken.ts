import { SeatIndexSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class SeatsStillTaken extends Schema.TaggedError<
  SeatsStillTaken,
  { readonly brand: unique symbol }
>()("SeatsStillTaken", {
  seats: Schema.Array(SeatIndexSchema),
  wanted: Schema.Int,
}) {
  override get message() {
    return `The table cannot shrink to ${this.wanted} seats while seats ${this.seats.join(", ")} are taken or asked for. Move or remove those players and answer their requests first, or keep more seats.`;
  }
}
