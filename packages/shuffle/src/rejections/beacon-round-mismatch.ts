import { Schema } from "effect";

export class BeaconRoundMismatch extends Schema.TaggedError<
  BeaconRoundMismatch,
  { readonly brand: unique symbol }
>()("BeaconRoundMismatch", { sealed: Schema.Int, used: Schema.Int }) {
  override get message() {
    return `The seal named beacon round ${this.sealed}, and the deck was ordered with beacon round ${this.used}. A server that may pick its round after sealing can try rounds until it likes the deal.`;
  }
}
