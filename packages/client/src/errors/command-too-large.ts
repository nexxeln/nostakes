import { Schema } from "effect";

export class CommandTooLarge extends Schema.TaggedError<
  CommandTooLarge,
  { readonly brand: unique symbol }
>()("CommandTooLarge", { bytes: Schema.Int, limit: Schema.Int }) {
  override get message() {
    return `This command encodes to ${this.bytes} bytes, over the ${this.limit} byte frame limit, and the server would close the socket for it. Send a smaller command.`;
  }
}
