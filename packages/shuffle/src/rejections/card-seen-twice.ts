import { Schema } from "effect";

import { CardSchema, DealIndexSchema } from "../schemas.js";

export class CardSeenTwice extends Schema.TaggedError<
  CardSeenTwice,
  { readonly brand: unique symbol }
>()("CardSeenTwice", {
  card: CardSchema,
  first: DealIndexSchema,
  second: DealIndexSchema,
}) {
  override get message() {
    return `Card ${this.card} was dealt at both deal ${this.first} and deal ${this.second}, so the sealed deck holds a card twice. Both openings check against the seal, which makes them proof.`;
  }
}
