import { Option, Schema } from "effect";

import { MillisSchema } from "../time.js";

export class QuietNotDue extends Schema.TaggedError<
  QuietNotDue,
  { readonly brand: unique symbol }
>()("QuietNotDue", { due: Schema.Option(MillisSchema) }) {
  override get message() {
    return Option.match(this.due, {
      onNone: () =>
        "The table cannot go quiet: a seated player is connected, or it is already quiet. Send QuietTable only when nextDeadline reports QuietDue.",
      onSome: (due) =>
        `The table goes quiet at ${due}, once the pause after the last seated player left runs out. Send QuietTable only when nextDeadline reports QuietDue.`,
    });
  }
}
