import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class RunsOutOfRange extends Schema.TaggedError<
  RunsOutOfRange,
  { readonly brand: unique symbol }
>()("RunsOutOfRange", {
  maxRuns: Schema.Int,
  runs: Schema.Int,
  seat: SeatIndexSchema,
}) {
  override get message() {
    return `Seat ${this.seat} asked to run the board ${this.runs} times, but this table and the cards left allow at most ${this.maxRuns}. Choose a number from 1 to ${this.maxRuns}.`;
  }
}
