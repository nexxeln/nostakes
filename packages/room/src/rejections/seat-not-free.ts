import { SeatIndexSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class SeatNotFree extends Schema.TaggedError<
  SeatNotFree,
  { readonly brand: unique symbol }
>()("SeatNotFree", { seat: SeatIndexSchema }) {
  override get message() {
    return `Seat ${this.seat} is taken or already requested. Choose an empty seat with no pending request.`;
  }
}
