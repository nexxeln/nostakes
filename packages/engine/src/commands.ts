import { Data, Schema } from "effect";

import { ChipsSchema, PlayerIdSchema, SeatIndexSchema } from "./primitives.js";
import { TableConfigSchema } from "./rules.js";

export const CommandSchema = Schema.TaggedUnion({
  AddChips: { amount: ChipsSchema, seat: SeatIndexSchema },
  ChangeRules: { config: TableConfigSchema },
  SetSittingOut: { seat: SeatIndexSchema, sittingOut: Schema.Boolean },
  SitDown: {
    buyIn: ChipsSchema,
    player: PlayerIdSchema,
    seat: SeatIndexSchema,
  },
  StandUp: { seat: SeatIndexSchema },
});

export type Command = typeof CommandSchema.Type;

export const Commands = Data.taggedEnum<Command>();

export type CommandOf<Tag extends Command["_tag"]> = Data.TaggedEnum.Value<
  Command,
  Tag
>;
