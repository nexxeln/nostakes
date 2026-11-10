import { Schema } from "effect";

export class DealingIsAutomatic extends Schema.TaggedError<
  DealingIsAutomatic,
  { readonly brand: unique symbol }
>()("DealingIsAutomatic", { betweenHandsSeconds: Schema.Int }) {
  override get message() {
    return `This room deals by itself ${this.betweenHandsSeconds} seconds after each hand, so there is no hand to call. Change the dealing setting to Host to deal each hand yourself.`;
  }
}
