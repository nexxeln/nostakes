import { Schema } from "effect";

export class TooManyKnocks extends Schema.TaggedError<
  TooManyKnocks,
  { readonly brand: unique symbol }
>()("TooManyKnocks", { most: Schema.Int }) {
  override get message() {
    return `This room has taken ${this.most} knocks tonight, the most it keeps, so it takes no more. The host can let people join without knocking by turning off join approval.`;
  }
}
