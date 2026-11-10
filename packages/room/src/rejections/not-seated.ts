import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class NotSeated extends Schema.TaggedError<
  NotSeated,
  { readonly brand: unique symbol }
>()("NotSeated", { player: PlayerIdSchema }) {
  override get message() {
    return `${this.player} holds no seat. Send RequestSeat first.`;
  }
}
