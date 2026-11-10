import { Option, Schema } from "effect";

const describeRound = (value: Option.Option<number>) =>
  Option.match(value, {
    onNone: () => "no beacon",
    onSome: (round) => `beacon round ${round}`,
  });

export class BeaconRoundMismatch extends Schema.TaggedError<
  BeaconRoundMismatch,
  { readonly brand: unique symbol }
>()("BeaconRoundMismatch", {
  sealed: Schema.Option(Schema.Int),
  used: Schema.Option(Schema.Int),
}) {
  override get message() {
    return `The seal named ${describeRound(this.sealed)}, and the deck was ordered with ${describeRound(this.used)}. A server that may pick its round after sealing can try rounds until it likes the deal.`;
  }
}
