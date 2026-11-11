import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class AlreadyRemoved extends Schema.TaggedError<
  AlreadyRemoved,
  { readonly brand: unique symbol }
>()("AlreadyRemoved", { player: PlayerIdSchema }) {
  override get message() {
    return `${this.player} was already removed from this room, so there is nothing more to remove.`;
  }
}
