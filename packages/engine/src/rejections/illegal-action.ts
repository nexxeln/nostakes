import { Option, Schema } from "effect";

import { ActionSchema, LegalActionsSchema } from "../actions.js";
import { SeatIndexSchema } from "../primitives.js";

const describeLegal = (legal: typeof LegalActionsSchema.Type) =>
  [
    "fold",
    ...(legal.canCheck ? ["check"] : []),
    ...Option.match(legal.call, {
      onNone: () => [],
      onSome: (amount) => [`call ${amount}`],
    }),
    ...Option.match(legal.raise, {
      onNone: () => [],
      onSome: (range) => [`raise to ${range.minTo}-${range.maxTo}`],
    }),
  ].join(", ");

export class IllegalAction extends Schema.TaggedError<
  IllegalAction,
  { readonly brand: unique symbol }
>()("IllegalAction", {
  action: ActionSchema,
  legal: LegalActionsSchema,
  seat: SeatIndexSchema,
}) {
  override get message() {
    return `Seat ${this.seat} cannot ${this.action._tag} here. It may ${describeLegal(this.legal)}.`;
  }
}
