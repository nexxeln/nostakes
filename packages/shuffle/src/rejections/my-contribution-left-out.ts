import { Schema } from "effect";

export class MyContributionLeftOut extends Schema.TaggedError<
  MyContributionLeftOut,
  { readonly brand: unique symbol }
>()("MyContributionLeftOut", { seat: Schema.Int }) {
  override get message() {
    return `Your device sent a value for seat ${this.seat}, and the hand was ordered without it. Either it arrived late or the server dropped it to choose among deals.`;
  }
}
