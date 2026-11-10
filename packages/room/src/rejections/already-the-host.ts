import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class AlreadyTheHost extends Schema.TaggedError<
  AlreadyTheHost,
  { readonly brand: unique symbol }
>()("AlreadyTheHost", { player: PlayerIdSchema }) {
  override get message() {
    return `${this.player} already hosts this room. Transfer the role to another member.`;
  }
}
