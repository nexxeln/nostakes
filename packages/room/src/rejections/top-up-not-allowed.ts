import { ChipsSchema, PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

const reasons = {
  BelowMin: "only while their stack is below the smallest buy-in",
  WhenBust: "only once they have no chips left",
};

export class TopUpNotAllowed extends Schema.TaggedError<
  TopUpNotAllowed,
  { readonly brand: unique symbol }
>()("TopUpNotAllowed", {
  duringHand: Schema.Boolean,
  holding: ChipsSchema,
  min: ChipsSchema,
  player: PlayerIdSchema,
  rule: Schema.Literals(["BelowMin", "WhenBust"]),
}) {
  override get message() {
    return this.duringHand
      ? `${this.player} is in the hand being played. This room lets a player add chips ${reasons[this.rule]}, which the room can judge only between hands, so ask again when the hand ends.`
      : `${this.player} holds ${this.holding} chips, counting chips already on the way, and this room lets a player add chips ${reasons[this.rule]} (the smallest buy-in is ${this.min}). Play on, or ask the host to change the top-up rule.`;
  }
}
