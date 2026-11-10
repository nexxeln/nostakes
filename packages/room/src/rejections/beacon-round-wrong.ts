import { BeaconRoundSchema } from "@nostakes/shuffle";
import { Schema } from "effect";

export class BeaconRoundWrong extends Schema.TaggedError<
  BeaconRoundWrong,
  { readonly brand: unique symbol }
>()("BeaconRoundWrong", {
  given: BeaconRoundSchema,
  sealed: BeaconRoundSchema,
}) {
  override get message() {
    return `The seal names beacon round ${this.sealed}, and the deal brought round ${this.given}. Fetch round ${this.sealed} and deal again.`;
  }
}
