import { Schema } from "effect";

export class BombPotsOff extends Schema.TaggedError<
  BombPotsOff,
  { readonly brand: unique symbol }
>()("BombPotsOff", { handNumber: Schema.Int }) {
  override get message() {
    return `Hand ${this.handNumber} was called as a bomb pot, but this table has bomb pots off. Change the rules between hands to turn bomb pots on.`;
  }
}
