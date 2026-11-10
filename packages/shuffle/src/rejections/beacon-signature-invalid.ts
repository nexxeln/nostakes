import { Schema } from "effect";

export class BeaconSignatureInvalid extends Schema.TaggedError<
  BeaconSignatureInvalid,
  { readonly brand: unique symbol }
>()("BeaconSignatureInvalid", { beaconId: Schema.String, round: Schema.Int }) {
  override get message() {
    return `The signature given for ${this.beaconId} beacon round ${this.round} does not check against drand's public key for that chain. The server sent a beacon value drand never published for that round, so it could have picked the order itself. Keep the signature: anyone can check it.`;
  }
}
