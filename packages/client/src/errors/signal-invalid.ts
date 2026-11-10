import { Schema } from "effect";

export class SignalInvalid extends Schema.TaggedError<
  SignalInvalid,
  { readonly brand: unique symbol }
>()("SignalInvalid", { issue: Schema.String }) {
  override get message() {
    return `This signal does not match the room's signal schema, so it was never sent: ${this.issue}. Build it with the room's signal constructors.`;
  }
}
