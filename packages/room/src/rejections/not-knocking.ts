import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class NotKnocking extends Schema.TaggedError<
  NotKnocking,
  { readonly brand: unique symbol }
>()("NotKnocking", { player: PlayerIdSchema }) {
  override get message() {
    return `Player ${this.player} is not waiting at the door: they never knocked, or their knock was already answered or lapsed. Answer only a knock the view lists in knocking.`;
  }
}
