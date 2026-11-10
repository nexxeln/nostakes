import { Schema } from "effect";

export class ToyRefusal extends Schema.TaggedError<
  ToyRefusal,
  { readonly brand: unique symbol }
>()("ToyRefusal", {
  reason: Schema.Literals([
    "NotMember",
    "TurnRunning",
    "NotYourTurn",
    "DealPending",
    "StaleDeadline",
    "NoDealDue",
    "NotEnoughEntropy",
    "Jammed",
    "Broken",
  ]),
}) {
  override get message() {
    return `The toy room refused the command: ${this.reason}.`;
  }
}
