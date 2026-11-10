import { Schema } from "effect";

export class ShuffleRanOut extends Schema.TaggedError<
  ShuffleRanOut,
  { readonly brand: unique symbol }
>()("ShuffleRanOut", { given: Schema.Int }) {
  override get message() {
    return `The ${this.given} shuffle bytes ran out before the deck was shuffled. Send at least 128 fresh random bytes with every Deal.`;
  }
}
