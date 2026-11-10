import { SeatIndexSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class SealedSeatsMoved extends Schema.TaggedError<
  SealedSeatsMoved,
  { readonly brand: unique symbol }
>()("SealedSeatsMoved", {
  dealt: Schema.Array(SeatIndexSchema),
  sealed: Schema.Array(SeatIndexSchema),
}) {
  override get message() {
    return `The seal deals seats ${this.sealed.join(",")} in that order, and the table would deal ${this.dealt.join(",")}. The room should have withdrawn the seal when the seats changed; this is a bug in the room.`;
  }
}
