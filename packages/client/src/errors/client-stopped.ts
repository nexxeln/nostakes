import { CommandIdSchema } from "@nostakes/protocol";
import { Schema } from "effect";

export class ClientStopped extends Schema.TaggedError<
  ClientStopped,
  { readonly brand: unique symbol }
>()("ClientStopped", { id: CommandIdSchema }) {
  override get message() {
    return `The client stopped before the server answered command ${this.id}. The command may still have been applied. Start a new client to keep playing.`;
  }
}
