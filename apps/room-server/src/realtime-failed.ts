import { Schema } from "effect";

export const RealtimeStepSchema = Schema.Literals([
  "NewSession",
  "Publish",
  "Pull",
  "Renegotiate",
  "Close",
  "ReadSession",
  "IceServers",
]);

export type RealtimeStep = typeof RealtimeStepSchema.Type;

export class RealtimeFailed extends Schema.TaggedError<
  RealtimeFailed,
  { readonly brand: unique symbol }
>()("RealtimeFailed", {
  code: Schema.String,
  step: RealtimeStepSchema,
}) {
  override get message() {
    return `Cloudflare Realtime failed the ${this.step} step (${this.code}). The player was answered VoiceUnavailable and may join voice again.`;
  }
}
