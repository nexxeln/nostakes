import { Schema } from "effect";

import { MillisSchema } from "../time.js";

export class ClockNotDue extends Schema.TaggedError<
  ClockNotDue,
  { readonly brand: unique symbol }
>()("ClockNotDue", { at: MillisSchema, deadline: MillisSchema }) {
  override get message() {
    return `The clock runs to ${this.deadline}, and it is only ${this.at}. Send ExpireClock at or after the deadline.`;
  }
}
