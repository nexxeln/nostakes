import { ChipsSchema, PlayerIdSchema } from "@nostakes/engine";
import { Schema } from "effect";

export class ChipsOverMax extends Schema.TaggedError<
  ChipsOverMax,
  { readonly brand: unique symbol }
>()("ChipsOverMax", {
  amount: ChipsSchema,
  holding: ChipsSchema,
  max: ChipsSchema,
  player: PlayerIdSchema,
}) {
  override get message() {
    return `Adding ${this.amount} chips would take ${this.player} from ${this.holding} chips, counting chips already on the way, past the largest buy-in of ${this.max}. Ask for fewer chips.`;
  }
}
