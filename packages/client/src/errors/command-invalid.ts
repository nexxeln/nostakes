import { Schema } from "effect";

export class CommandInvalid extends Schema.TaggedError<
  CommandInvalid,
  { readonly brand: unique symbol }
>()("CommandInvalid", { issue: Schema.String }) {
  override get message() {
    return `This command does not match the room's command schema, so it was never sent: ${this.issue}. Build it with the room's command constructors.`;
  }
}
