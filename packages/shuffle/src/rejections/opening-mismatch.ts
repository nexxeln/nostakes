import { Schema } from "effect";

import { DeckSlotSchema, PositionSchema } from "../schemas.js";

export class OpeningMismatch extends Schema.TaggedError<
  OpeningMismatch,
  { readonly brand: unique symbol }
>()("OpeningMismatch", {
  position: PositionSchema,
  slot: DeckSlotSchema,
}) {
  override get message() {
    return `The card, salt, or path opened at position ${this.position} of sealed deck ${this.slot} does not hash to that deck's sealed root, so the server changed a card after sealing or sent a damaged opening. Keep the opening and the seal: together they prove it.`;
  }
}
