import { BeaconRoundSchema } from "@nostakes/shuffle";
import { Schema } from "effect";

export class BeaconRejected extends Schema.TaggedError<
  BeaconRejected,
  { readonly brand: unique symbol }
>()("BeaconRejected", {
  reason: Schema.Literals([
    "BeaconSignatureMalformed",
    "BeaconSignatureInvalid",
  ]),
  round: BeaconRoundSchema,
}) {
  override get message() {
    return `The signature brought for beacon round ${this.round} does not check against the room's chain (${this.reason}). A relay served a bad value: fetch the round again, from another relay.`;
  }
}
