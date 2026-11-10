import { Schema } from "effect";

export const OutageSightingSchema = Schema.Literals([
  "the server's record",
  "this device",
]);

export type OutageSighting = typeof OutageSightingSchema.Type;

const offsetText = (offset: number) =>
  `${Math.abs(offset)} ms ${offset < 0 ? "before" : "after"}`;

export class OutageClaimedEarly extends Schema.TaggedError<
  OutageClaimedEarly,
  { readonly brand: unique symbol }
>()("OutageClaimedEarly", {
  allowance: Schema.Int,
  giveUpAt: Schema.Int,
  round: Schema.Int,
  roundAt: Schema.Int,
  seenAt: Schema.Int,
  seenBy: OutageSightingSchema,
}) {
  override get message() {
    const wait = this.giveUpAt - this.roundAt;
    const when = offsetText(this.seenAt - this.roundAt);

    const seen =
      this.seenBy === "the server's record"
        ? `the server's own record puts the deal ${when} beacon round ${this.round} was due`
        : `the deal reached this device ${when} beacon round ${this.round} was due, even allowing ${this.allowance} ms for the two clocks`;

    return `The server shuffled this hand itself, saying it could not get beacon round ${this.round}, but ${seen}. A server must keep trying for ${wait} ms after the round is due before it may deal without it, so this claim came too early to be true.`;
  }
}
