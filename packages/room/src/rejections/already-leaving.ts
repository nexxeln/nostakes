import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class AlreadyLeaving extends Schema.TaggedError<
  AlreadyLeaving,
  { readonly brand: unique symbol }
>()("AlreadyLeaving", { player: PlayerIdSchema }) {
  override get message() {
    return `${this.player} already leaves the seat when this hand ends. There is nothing more to do.`;
  }
}
