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

const CODE_WORD = /^[A-Za-z][A-Za-z_]{0,47}\d{0,3}$/u;

export const UNREADABLE_CODE = "Unreadable";

export const codeWords = (served: string) =>
  served
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => (CODE_WORD.test(word) ? word : UNREADABLE_CODE))
    .join(" ");

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
