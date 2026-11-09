import { Schema } from "effect";

import { ChipsSchema } from "../primitives.js";

export class AmountNotPositive extends Schema.TaggedError<AmountNotPositive>()(
  "AmountNotPositive",
  { amount: ChipsSchema }
) {
  override get message() {
    return `An amount of ${this.amount} chips moves nothing. Send at least one chip.`;
  }
}
