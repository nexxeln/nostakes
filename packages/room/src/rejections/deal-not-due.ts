import { Schema } from "effect";

import { MillisSchema } from "../time.js";

export class DealNotDue extends Schema.TaggedError<
  DealNotDue,
  { readonly brand: unique symbol }
>()("DealNotDue", {
  due: Schema.Option(MillisSchema),
  reason: Schema.Literals([
    "Waiting",
    "HandInProgress",
    "TooFewPlayers",
    "TooEarly",
    "WaitingForHost",
  ]),
}) {
  override get message() {
    return `No deal is due (${this.reason}). Send Deal only at the moment nextDeadline reports a deal.`;
  }
}
