import { Schema } from "effect";

import { DeckSlotSchema } from "../schemas.js";

export class SpareDeckMismatch extends Schema.TaggedError<
  SpareDeckMismatch,
  { readonly brand: unique symbol }
>()("SpareDeckMismatch", { slot: DeckSlotSchema }) {
  override get message() {
    return `The spare deck opened for slot ${this.slot} does not hash to the root sealed for that slot, so the server opened a different deck than it sealed.`;
  }
}
