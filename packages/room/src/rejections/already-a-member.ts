import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class AlreadyAMember extends Schema.TaggedError<
  AlreadyAMember,
  { readonly brand: unique symbol }
>()("AlreadyAMember", { player: PlayerIdSchema }) {
  override get message() {
    return `${this.player} is already in this room. Send SetProfile to change the name or avatar.`;
  }
}
