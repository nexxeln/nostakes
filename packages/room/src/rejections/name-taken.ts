import { Schema } from "effect";

import { NameSchema } from "../identity.js";

export class NameTaken extends Schema.TaggedError<
  NameTaken,
  { readonly brand: unique symbol }
>()("NameTaken", { wanted: NameSchema }) {
  override get message() {
    return `Someone in this room already goes by ${this.wanted}, compared without case and after Unicode compatibility normalisation. Pick a name nobody else here has, for example by adding an initial.`;
  }
}
