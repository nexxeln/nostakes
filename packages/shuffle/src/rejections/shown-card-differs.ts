import { Schema } from "effect";

import { CardSchema, DealIndexSchema } from "../schemas.js";

export class ShownCardDiffers extends Schema.TaggedError<
  ShownCardDiffers,
  { readonly brand: unique symbol }
>()("ShownCardDiffers", {
  dealIndex: DealIndexSchema,
  opened: CardSchema,
  shown: CardSchema,
}) {
  override get message() {
    return `The table showed card ${this.shown} for deal ${this.dealIndex}, and the sealed card there is ${this.opened}.`;
  }
}
