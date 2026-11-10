import { Schema } from "effect";

export class RoundTripFailed extends Schema.TaggedError<
  RoundTripFailed,
  { readonly brand: unique symbol }
>()("RoundTripFailed", { round: Schema.Int, step: Schema.String }) {
  override get message() {
    return `The round-trip probe failed at round ${this.round}, step ${this.step}. Rerun it and read the room's inspection.`;
  }
}
