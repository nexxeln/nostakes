import { Schema } from "effect";

import { RoleSchema } from "../schemas.js";

export class RoleOutOfRange extends Schema.TaggedError<
  RoleOutOfRange,
  { readonly brand: unique symbol }
>()("RoleOutOfRange", { dealtIn: Schema.Int, role: RoleSchema }) {
  override get message() {
    return `A card was shown in a place that does not exist in a hand dealt to ${this.dealtIn} players.`;
  }
}
