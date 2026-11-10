import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class WinningHandMustTable extends Schema.TaggedError<
  WinningHandMustTable,
  { readonly brand: unique symbol }
>()("WinningHandMustTable", {
  pot: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  seat: SeatIndexSchema,
}) {
  override get message() {
    return `Seat ${this.seat} beats or ties every hand tabled for pot ${this.pot}, so it cannot muck: cards speak. Send TableHand.`;
  }
}
