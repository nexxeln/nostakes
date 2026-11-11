import { Schema } from "effect";

export class TooManyKnocking extends Schema.TaggedError<
  TooManyKnocking,
  { readonly brand: unique symbol }
>()("TooManyKnocking", { most: Schema.Int }) {
  override get message() {
    return `${this.most} people are already waiting for the host to let them in, the most the room keeps at the door. Knock again once the host has answered someone or a knock has lapsed.`;
  }
}
