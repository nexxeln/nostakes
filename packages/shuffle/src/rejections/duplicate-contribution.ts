import { Schema } from "effect";

export class DuplicateContribution extends Schema.TaggedError<
  DuplicateContribution,
  { readonly brand: unique symbol }
>()("DuplicateContribution", { source: Schema.String }) {
  override get message() {
    return `The hand lists two contributions from ${this.source}. Each source may add one value, or the server could pick whichever pair it liked.`;
  }
}
