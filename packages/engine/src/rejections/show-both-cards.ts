import { Schema } from "effect";

import { SeatIndexSchema } from "../primitives.js";

export class ShowBothCards extends Schema.TaggedError<
  ShowBothCards,
  { readonly brand: unique symbol }
>()("ShowBothCards", { seat: SeatIndexSchema }) {
  override get message() {
    return `Seat ${this.seat} showed one hole card, but this table shows both or neither. Send ShowCards with every hole card not yet shown.`;
  }
}
