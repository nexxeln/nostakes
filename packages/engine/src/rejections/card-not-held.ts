import { Schema } from "effect";

import { CardSchema } from "../cards.js";
import { SeatIndexSchema } from "../primitives.js";

export class CardNotHeld extends Schema.TaggedError<
  CardNotHeld,
  { readonly brand: unique symbol }
>()("CardNotHeld", { card: CardSchema, seat: SeatIndexSchema }) {
  override get message() {
    return `Seat ${this.seat} did not hold card ${this.card} in the last hand. Show only your own hole cards.`;
  }
}
