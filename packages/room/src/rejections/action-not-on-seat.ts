import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class ActionNotOnSeat extends Schema.TaggedError<
  ActionNotOnSeat,
  { readonly brand: unique symbol }
>()("ActionNotOnSeat", { player: PlayerIdSchema }) {
  override get message() {
    return `The action is not on ${this.player}, so there is nothing to act for. Send ActForSeat only for the seat holding up the game.`;
  }
}
