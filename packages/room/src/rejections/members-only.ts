import { Schema } from "effect";

export class MembersOnly extends Schema.TaggedError<
  MembersOnly,
  { readonly brand: unique symbol }
>()("MembersOnly", { command: Schema.String }) {
  override get message() {
    return `${this.command} comes from a member. The server sends only Deal and ExpireClock.`;
  }
}
