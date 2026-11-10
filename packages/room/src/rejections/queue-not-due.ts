import { Schema } from "effect";

export class QueueNotDue extends Schema.TaggedError<
  QueueNotDue,
  { readonly brand: unique symbol }
>()("QueueNotDue", { handInProgress: Schema.Boolean }) {
  override get message() {
    return `Nothing queued is due${this.handInProgress ? " while a hand is in progress" : ""}. Send RunQueue only when nextDeadline reports QueueDue.`;
  }
}
