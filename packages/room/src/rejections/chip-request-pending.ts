import { ChipsSchema, PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class ChipRequestPending extends Schema.TaggedError<
  ChipRequestPending,
  { readonly brand: unique symbol }
>()("ChipRequestPending", { amount: ChipsSchema, player: PlayerIdSchema }) {
  override get message() {
    return `${this.player} already asked for ${this.amount} chips. Wait for the host to approve or deny it.`;
  }
}
