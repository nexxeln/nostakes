import { Schema } from "effect";

export const WithdrawalSchema = Schema.Literals([
  "never",
  "after the round",
  "too close to the round",
  "while away",
]);

export type Withdrawal = typeof WithdrawalSchema.Type;

const story: Record<Withdrawal, string> = {
  "after the round":
    "The server called it off after that round was due, when it could already know the deal.",
  never: "The round is past and the hand was never dealt or called off.",
  "too close to the round":
    "The server called it off so close to that round that this device cannot tell whether the server already knew the deal.",
  "while away":
    "It was called off while this device was away, so this device cannot tell whether that was before the round. Players who were connected can.",
};

export class SealWithNoDeal extends Schema.TaggedError<
  SealWithNoDeal,
  { readonly brand: unique symbol }
>()("SealWithNoDeal", {
  hand: Schema.Int,
  round: Schema.Int,
  withdrawal: WithdrawalSchema,
}) {
  override get message() {
    return `Hand ${this.hand} was sealed for beacon round ${this.round} and never dealt. ${story[this.withdrawal]} Cancelling a sealed hand is the one way left for a server to throw away a deal it does not like, so every cancelled hand is shown.`;
  }
}
