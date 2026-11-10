import { BeaconRoundSchema } from "@nostakes/shuffle";
import { Schema } from "effect";

export class SealRoundTooSoon extends Schema.TaggedError<
  SealRoundTooSoon,
  { readonly brand: unique symbol }
>()("SealRoundTooSoon", {
  earliest: BeaconRoundSchema,
  round: BeaconRoundSchema,
}) {
  override get message() {
    return `A seal may not name beacon round ${this.round}: it could be out before every player has the seal. Name round ${this.earliest} or later, from roundToSeal at the time of the seal.`;
  }
}
