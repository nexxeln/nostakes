import { Data, Schema } from "effect";

import { ActionSchema } from "./actions.js";
import { DeckSchema } from "./cards.js";
import { ChipsSchema, PlayerIdSchema, SeatIndexSchema } from "./primitives.js";
import { TableConfigSchema } from "./rules.js";

export const CommandSchema = Schema.TaggedUnion({
  Act: { action: ActionSchema, seat: SeatIndexSchema },
  AddChips: { amount: ChipsSchema, seat: SeatIndexSchema },
  ChangeRules: { config: TableConfigSchema },
  ChooseRuns: {
    runs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    seat: SeatIndexSchema,
  },
  SetSittingOut: { seat: SeatIndexSchema, sittingOut: Schema.Boolean },
  SitDown: {
    buyIn: ChipsSchema,
    player: PlayerIdSchema,
    seat: SeatIndexSchema,
  },
  StandUp: { seat: SeatIndexSchema },
  StartHand: { deck: DeckSchema, straddles: Schema.Array(SeatIndexSchema) },
});

export type Command = typeof CommandSchema.Type;

export const Commands = Data.taggedEnum<Command>();

export type CommandOf<Tag extends Command["_tag"]> = Data.TaggedEnum.Value<
  Command,
  Tag
>;
