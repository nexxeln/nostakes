import { Schema } from "effect";

export class MediaFailed extends Schema.TaggedError<
  MediaFailed,
  { readonly brand: unique symbol }
>()("MediaFailed", { cause: Schema.Defect(), step: Schema.String }) {
  override get message() {
    return `Mediabunny failed to ${this.step}: ${String(this.cause)}`;
  }
}
