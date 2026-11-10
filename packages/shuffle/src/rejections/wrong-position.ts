import { Schema } from "effect";

import { DealIndexSchema, PositionSchema } from "../schemas.js";

export class WrongPosition extends Schema.TaggedError<
  WrongPosition,
  { readonly brand: unique symbol }
>()("WrongPosition", {
  dealIndex: DealIndexSchema,
  expected: PositionSchema,
  opened: PositionSchema,
}) {
  override get message() {
    return `Deal ${this.dealIndex} should come from sealed position ${this.expected}, and the server opened position ${this.opened}. The card is real but was dealt out of order.`;
  }
}
