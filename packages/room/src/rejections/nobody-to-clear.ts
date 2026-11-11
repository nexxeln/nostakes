import { Schema } from "effect";

export class NobodyToClear extends Schema.TaggedError<
  NobodyToClear,
  { readonly brand: unique symbol }
>()("NobodyToClear", { members: Schema.Int }) {
  override get message() {
    return `All ${this.members} members still in the room hold a seat or host it, and nobody who left is without a ledger line, so clearing the room would remove nobody. Remove someone by name instead.`;
  }
}
