import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class NoSeatRequest extends Schema.TaggedError<
  NoSeatRequest,
  { readonly brand: unique symbol }
>()("NoSeatRequest", { player: PlayerIdSchema }) {
  override get message() {
    return `${this.player} has no pending seat request. Only a pending request can be approved or denied.`;
  }
}
