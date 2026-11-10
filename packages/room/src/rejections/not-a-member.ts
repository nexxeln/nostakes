import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class NotAMember extends Schema.TaggedError<
  NotAMember,
  { readonly brand: unique symbol }
>()("NotAMember", { player: PlayerIdSchema }) {
  override get message() {
    return `${this.player} is not in this room. Send Join first.`;
  }
}
