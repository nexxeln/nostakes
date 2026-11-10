import { ChipsSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class BuyInOutOfRange extends Schema.TaggedError<
  BuyInOutOfRange,
  { readonly brand: unique symbol }
>()("BuyInOutOfRange", {
  amount: ChipsSchema,
  max: ChipsSchema,
  min: ChipsSchema,
}) {
  override get message() {
    return `A buy-in of ${this.amount} chips is outside this room's range of ${this.min} to ${this.max}. Ask for an amount inside the range.`;
  }
}
