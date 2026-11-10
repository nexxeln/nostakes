import { Schema } from "effect";

import { MillisSchema } from "../time.js";

export class SealNotDue extends Schema.TaggedError<
  SealNotDue,
  { readonly brand: unique symbol }
>()("SealNotDue", {
  due: Schema.Option(MillisSchema),
  reason: Schema.Literals([
    "Plain",
    "AlreadySealed",
    "NoDealComing",
    "TooEarly",
  ]),
}) {
  override get message() {
    return `No seal is due (${this.reason}). Send SealHand only at the moment nextDeadline reports SealDue.`;
  }
}
