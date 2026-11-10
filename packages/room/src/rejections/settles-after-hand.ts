import { Schema } from "effect";

export class SettlesAfterHand extends Schema.TaggedError<
  SettlesAfterHand,
  { readonly brand: unique symbol }
>()("SettlesAfterHand", { handNumber: Schema.Int }) {
  override get message() {
    return `Hand ${this.handNumber} is in progress, and the chips in its pots belong to no one yet. Ask for the settlement again when the hand ends.`;
  }
}
