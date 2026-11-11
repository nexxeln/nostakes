import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class RemovingYourself extends Schema.TaggedError<
  RemovingYourself,
  { readonly brand: unique symbol }
>()("RemovingYourself", { player: PlayerIdSchema }) {
  override get message() {
    return `${this.player} hosts and asked to remove themselves. A host leaves with LeaveRoom, which hands the room to someone else and keeps their pass.`;
  }
}
