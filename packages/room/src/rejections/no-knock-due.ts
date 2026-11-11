import { Option, Schema } from "effect";

import { MillisSchema } from "../time.js";

export class NoKnockDue extends Schema.TaggedError<
  NoKnockDue,
  { readonly brand: unique symbol }
>()("NoKnockDue", { next: Schema.Option(MillisSchema) }) {
  override get message() {
    return Option.match(this.next, {
      onNone: () =>
        "No knock is waiting, so none can lapse. Send LapseKnocks only when nextDeadline reports KnockLapses.",
      onSome: (next) =>
        `The next knock lapses at ${next}, not yet. Send LapseKnocks only when nextDeadline reports KnockLapses.`,
    });
  }
}
