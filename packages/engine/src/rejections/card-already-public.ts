import { Schema } from "effect";

import { CardSchema } from "../cards.js";
import { SeatIndexSchema } from "../primitives.js";

export class CardAlreadyPublic extends Schema.TaggedError<
  CardAlreadyPublic,
  { readonly brand: unique symbol }
>()("CardAlreadyPublic", { card: CardSchema, seat: SeatIndexSchema }) {
  override get message() {
    return `Card ${this.card} of seat ${this.seat} is already face up. Show only cards that are still hidden.`;
  }
}
