import { Schema } from "effect";

export class NothingSealed extends Schema.TaggedError<
  NothingSealed,
  { readonly brand: unique symbol }
>()("NothingSealed", { hand: Schema.Int }) {
  override get message() {
    return `Hand ${this.hand} is not sealed, so it cannot be dealt from a seal. Send DealSealed only when nextDeadline reports SealedDealDue.`;
  }
}
