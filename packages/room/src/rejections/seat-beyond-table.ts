import { SeatIndexSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class SeatBeyondTable extends Schema.TaggedError<
  SeatBeyondTable,
  { readonly brand: unique symbol }
>()("SeatBeyondTable", { seat: SeatIndexSchema, seats: Schema.Int }) {
  override get message() {
    return `Seat ${this.seat} is not at this table, which has ${this.seats} seats numbered from 0. Choose a seat below ${this.seats}, or ask the host for more seats.`;
  }
}
