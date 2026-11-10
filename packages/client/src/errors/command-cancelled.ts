import { CommandIdSchema } from "@nostakes/protocol";
import { Schema } from "effect";

export class CommandCancelled extends Schema.TaggedError<
  CommandCancelled,
  { readonly brand: unique symbol }
>()("CommandCancelled", {
  id: CommandIdSchema,
  mayStillApply: Schema.Boolean,
}) {
  override get message() {
    return this.mayStillApply
      ? `Command ${this.id} was cancelled on this client only. It had already been sent, so the server may still apply it; watch the event stream to learn whether it did.`
      : `Command ${this.id} was cancelled before it left this client. The server will never apply it.`;
  }
}
