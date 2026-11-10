import { Schema } from "effect";

export interface RetryPolicy {
  readonly firstMs: number;
  readonly capMs: number;
  readonly stallAfter: number;
}

export const RETRY_POLICY: RetryPolicy = {
  capMs: 60_000,
  firstMs: 1000,
  stallAfter: 5,
};

export const retryDelay = (policy: RetryPolicy, refusals: number) =>
  Math.min(policy.capMs, policy.firstMs * 2 ** Math.max(0, refusals - 1));

export class RefusedDeadline extends Schema.TaggedError<
  RefusedDeadline,
  { readonly brand: unique symbol }
>()("RefusedDeadline", {
  code: Schema.String,
  deadline: Schema.String,
  refusals: Schema.Int,
  rejection: Schema.String,
  retryInMs: Schema.Int,
  stalled: Schema.Boolean,
}) {
  override get message() {
    const marked = this.stalled
      ? " The room is marked stalled, so its players see that the table is stuck and can end the night."
      : "";

    return `Room ${this.code} refused the server's answer to its ${this.deadline} deadline, ${this.refusals} in a row: ${this.rejection}. The server asks again in ${this.retryInMs} ms.${marked} This is a bug in the room core.`;
  }
}
