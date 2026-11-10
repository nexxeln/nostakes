import { Schema } from "effect";

import { CHIP_LIMIT, ChipsSchema } from "../primitives.js";

export class StraddleAboveChipLimit extends Schema.TaggedError<
  StraddleAboveChipLimit,
  { readonly brand: unique symbol }
>()("StraddleAboveChipLimit", {
  bigBlind: ChipsSchema,
  straddles: Schema.Int,
}) {
  override get message() {
    return `With a big blind of ${this.bigBlind}, a chain of ${this.straddles} straddles doubles past the ${CHIP_LIMIT} chips a table can hold. Lower the big blind or allow fewer straddles in a row.`;
  }
}
