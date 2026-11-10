import { PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class NoChipRequest extends Schema.TaggedError<
  NoChipRequest,
  { readonly brand: unique symbol }
>()("NoChipRequest", { player: PlayerIdSchema }) {
  override get message() {
    return `${this.player} has no pending chip request. Only a pending request can be approved or denied.`;
  }
}
