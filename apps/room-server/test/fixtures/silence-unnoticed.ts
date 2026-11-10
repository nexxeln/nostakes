import { Schema } from "effect";

export class SilenceUnnoticed extends Schema.TaggedError<
  SilenceUnnoticed,
  { readonly brand: unique symbol }
>()("SilenceUnnoticed", { step: Schema.String }) {
  override get message() {
    return `The silence probe failed at: ${this.step}. Check that the alarm covers each live socket's silence deadline and that pings are answered by the auto-response.`;
  }
}
