import { Schema } from "effect";

export class HibernationLost extends Schema.TaggedError<
  HibernationLost,
  { readonly brand: unique symbol }
>()("HibernationLost", { step: Schema.String }) {
  override get message() {
    return `The hibernation probe failed at: ${this.step}. Check that socket identity lives in the attachment, not in memory.`;
  }
}
