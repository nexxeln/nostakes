import { Schema } from "effect";

export class NoOutsideRandomness extends Schema.TaggedError<
  NoOutsideRandomness,
  { readonly brand: unique symbol }
>()("NoOutsideRandomness", { hand: Schema.Int }) {
  override get message() {
    return `Hand ${this.hand} was dealt with no beacon and no player contribution, so the server alone chose the order. The cards can still be checked against the seal, but the order cannot be called fair.`;
  }
}
