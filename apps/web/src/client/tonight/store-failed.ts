import { Schema } from "effect";

export class StoreFailed extends Schema.TaggedError<
  StoreFailed,
  { readonly brand: unique symbol }
>()("StoreFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `This device could not keep tonight's moments at "${this.step}": ${this.detail}. The moments still show while the page is open.`;
  }
}
