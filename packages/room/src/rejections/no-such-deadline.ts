import { Schema } from "effect";

import { MillisSchema } from "../time.js";

export class NoSuchDeadline extends Schema.TaggedError<
  NoSuchDeadline,
  { readonly brand: unique symbol }
>()("NoSuchDeadline", { deadline: MillisSchema }) {
  override get message() {
    return `No clock runs to ${this.deadline}. The decision it timed is already over. Ask nextDeadline for the current one.`;
  }
}
