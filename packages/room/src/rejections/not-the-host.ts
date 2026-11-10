import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class NotTheHost extends Schema.TaggedError<
  NotTheHost,
  { readonly brand: unique symbol }
>()("NotTheHost", { host: PlayerIdSchema, player: PlayerIdSchema }) {
  override get message() {
    return `Only the host, ${this.host}, may do that, and ${this.player} is not the host. Ask ${this.host}, or have ${this.host} send TransferHost.`;
  }
}
