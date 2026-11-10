import { Schema } from "effect";

export class BeaconGaveUp extends Schema.TaggedError<
  BeaconGaveUp,
  { readonly brand: unique symbol }
>()("BeaconGaveUp", {
  code: Schema.String,
  pastDueMs: Schema.Int,
  round: Schema.Int,
  triedMs: Schema.Int,
}) {
  override get message() {
    return `Room ${this.code} could not get drand round ${this.round}: it asked the relays for ${this.triedMs} ms and gave up ${this.pastDueMs} ms after the round was due, so it shuffled the hand itself and every player sees that hand as not checked. Check that the Worker can reach the drand relays.`;
  }
}
