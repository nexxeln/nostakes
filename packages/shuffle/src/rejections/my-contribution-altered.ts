import { Schema } from "effect";

export class MyContributionAltered extends Schema.TaggedError<
  MyContributionAltered,
  { readonly brand: unique symbol }
>()("MyContributionAltered", { seat: Schema.Int }) {
  override get message() {
    return `The hand was ordered with a value for seat ${this.seat} that is not the one your device sent.`;
  }
}
