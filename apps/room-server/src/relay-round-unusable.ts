import { Schema } from "effect";

export class RelayRoundUnusable extends Schema.TaggedError<
  RelayRoundUnusable,
  { readonly brand: unique symbol }
>()("RelayRoundUnusable", {
  reason: Schema.String,
  relay: Schema.String,
  round: Schema.Int,
}) {
  override get message() {
    return `Relay ${this.relay} gave no usable beacon round ${this.round} (${this.reason}). The next relay is tried until the wait limit passes.`;
  }
}
