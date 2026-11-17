import { Schema } from "effect";

export const VoiceTroubleSchema = Schema.Literals([
  "Refused",
  "Unavailable",
  "Expired",
  "MicBlocked",
  "Broken",
]);

export type VoiceTrouble = typeof VoiceTroubleSchema.Type;

export class VoiceFailed extends Schema.TaggedError<
  VoiceFailed,
  { readonly brand: unique symbol }
>()("VoiceFailed", { step: Schema.String, trouble: VoiceTroubleSchema }) {
  override get message() {
    return `Voice failed at ${this.step} (${this.trouble}). The voice line retries on its own unless the room refused it.`;
  }
}
