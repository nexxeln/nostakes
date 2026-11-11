import { Schema } from "effect";

export class TooManyPeople extends Schema.TaggedError<
  TooManyPeople,
  { readonly brand: unique symbol }
>()("TooManyPeople", { most: Schema.Int, people: Schema.Int }) {
  override get message() {
    return `The room already holds ${this.people} people, members and those who left, and takes at most ${this.most}. The host frees a place by removing someone.`;
  }
}
