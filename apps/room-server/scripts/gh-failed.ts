import { Schema } from "effect";

export class GhFailed extends Schema.TaggedError<
  GhFailed,
  { readonly brand: unique symbol }
>()("GhFailed", { command: Schema.String, exitCode: Schema.Int }) {
  override get message() {
    return `gh ${this.command} exited with ${this.exitCode}. Check gh auth status, and run this inside a checkout of the nostakes repository.`;
  }
}
