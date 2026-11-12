import { Schema } from "effect";

export class KeepFailed extends Schema.TaggedError<
  KeepFailed,
  { readonly brand: unique symbol }
>()("KeepFailed", {
  file: Schema.String,
  reason: Schema.Literals(["Cancelled", "NotAllowed", "NotDrawn", "Refused"]),
}) {
  override get message() {
    return `The picture ${this.file} was not kept: ${this.reason}. Tap Keep again, or take a screenshot.`;
  }
}
