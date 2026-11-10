import { Schema } from "effect";

export class BeaconSignatureMalformed extends Schema.TaggedError<
  BeaconSignatureMalformed,
  { readonly brand: unique symbol }
>()("BeaconSignatureMalformed", {
  beaconId: Schema.String,
  bytes: Schema.Int,
  round: Schema.Int,
}) {
  override get message() {
    return `The ${this.bytes}-byte signature given for ${this.beaconId} beacon round ${this.round} is not a point that drand could have signed with, so the randomness that came with it is not drand's. Keep the signature: anyone can check it.`;
  }
}
