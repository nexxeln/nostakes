import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export const StraddleProblemSchema = Schema.Literals([
  "HeadsUp",
  "ButtonStraddleOff",
  "UnderTheGunOff",
  "TooMany",
  "OutOfTurn",
  "CannotCover",
  "PostingToEnter",
]);

export type StraddleProblem = typeof StraddleProblemSchema.Type;

export class StraddleNotAllowed extends Schema.TaggedError<
  StraddleNotAllowed,
  { readonly brand: unique symbol }
>()("StraddleNotAllowed", {
  reason: StraddleProblemSchema,
  straddles: Schema.Array(SeatIndexSchema),
}) {
  override get message() {
    return `Straddles [${this.straddles.join(", ")}] break the straddle rules (${this.reason}). Send an unbroken chain of seats starting after the big blind, or the button alone, each holding more than its straddle, and never heads-up.`;
  }
}
