import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class AlreadyKnocked extends Schema.TaggedError<
  AlreadyKnocked,
  { readonly brand: unique symbol }
>()("AlreadyKnocked", { player: PlayerIdSchema }) {
  override get message() {
    return `Player ${this.player} already knocked on this room, and a pass knocks once. Ask for a new pass from the join route to knock again.`;
  }
}
