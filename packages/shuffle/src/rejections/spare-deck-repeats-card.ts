import { Schema } from "effect";

import { CardSchema, DeckSlotSchema } from "../schemas.js";

export class SpareDeckRepeatsCard extends Schema.TaggedError<
  SpareDeckRepeatsCard,
  { readonly brand: unique symbol }
>()("SpareDeckRepeatsCard", { card: CardSchema, slot: DeckSlotSchema }) {
  override get message() {
    return `The spare deck in slot ${this.slot} holds card ${this.card} twice, so the server sealed a deck that is not 52 different cards. Keep the opening: anyone can check it against the seal.`;
  }
}
