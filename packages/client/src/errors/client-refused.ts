import { CloseReasonSchema, CommandIdSchema } from "@nostakes/protocol";
import { Schema } from "effect";

export class ClientRefused extends Schema.TaggedError<
  ClientRefused,
  { readonly brand: unique symbol }
>()("ClientRefused", { id: CommandIdSchema, reason: CloseReasonSchema }) {
  override get message() {
    return `The server refused this client (${this.reason}) before it answered command ${this.id}, and the client will not reconnect. The command may still have been applied. Get a fresh room pass, then start a new client.`;
  }
}
