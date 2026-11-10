import { Schema } from "effect";

export class SealArrivedAfterRound extends Schema.TaggedError<
  SealArrivedAfterRound,
  { readonly brand: unique symbol }
>()("SealArrivedAfterRound", {
  arrivedAt: Schema.Int,
  round: Schema.Int,
  roundAt: Schema.Int,
  tolerance: Schema.Int,
}) {
  override get message() {
    return `Your device received the seal for this hand ${this.arrivedAt - this.roundAt} ms after beacon round ${this.round} was due, even allowing for its clock being ${this.tolerance} ms off. A server that sealed after seeing that round could have stacked the deck for it. If other players got the seal in time, your connection held it up; if nobody did, the server sealed late.`;
  }
}
