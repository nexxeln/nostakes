import { Schema } from "effect";

export class ServerOnly extends Schema.TaggedError<
  ServerOnly,
  { readonly brand: unique symbol }
>()("ServerOnly", { command: Schema.String }) {
  override get message() {
    return `Only the server sends ${this.command}, when nextDeadline asks for it. A member cannot.`;
  }
}
