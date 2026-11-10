import { Schema } from "effect";

import { CHIP_LIMIT, ChipsSchema, SeatIndexSchema } from "../primitives.js";

export class ChipLimitExceeded extends Schema.TaggedError<
  ChipLimitExceeded,
  { readonly brand: unique symbol }
>()("ChipLimitExceeded", {
  amount: ChipsSchema,
  available: ChipsSchema,
  seat: SeatIndexSchema,
}) {
  override get message() {
    return `Adding ${this.amount} chips at seat ${this.seat} would put more than ${CHIP_LIMIT} chips on the table, the most it can count exactly. Add at most ${this.available} chips.`;
  }
}
