import { Schema } from "effect";

export class HandInProgress extends Schema.TaggedError<
  HandInProgress,
  { readonly brand: unique symbol }
>()("HandInProgress", { handNumber: Schema.Int }) {
  override get message() {
    return `Hand ${this.handNumber} is still being played. Send this again after it ends.`;
  }
}
