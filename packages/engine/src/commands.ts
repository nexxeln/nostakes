import { Data, Schema } from "effect";

import { ActionSchema } from "./actions.js";
import { CardSchema, DeckSchema } from "./cards.js";
import { ChipsSchema, PlayerIdSchema, SeatIndexSchema } from "./primitives.js";
import { RunCountSchema, TableConfigSchema } from "./rules.js";

export const ShownCardsSchema = Schema.Array(CardSchema)
  .check(Schema.isMinLength(1), Schema.isMaxLength(2), Schema.isUnique())
  .pipe(Schema.brand("ShownCards"));

export type ShownCards = typeof ShownCardsSchema.Type;

export const CommandSchema = Schema.TaggedUnion({
  Act: { action: ActionSchema, seat: SeatIndexSchema },
  AddChips: { amount: ChipsSchema, seat: SeatIndexSchema },
  ChangeRules: { config: TableConfigSchema },
  ChooseRuns: { runs: RunCountSchema, seat: SeatIndexSchema },
  MuckHand: { seat: SeatIndexSchema },
  RabbitHunt: { seat: SeatIndexSchema },
  SetSittingOut: { seat: SeatIndexSchema, sittingOut: Schema.Boolean },
  ShowCards: { cards: ShownCardsSchema, seat: SeatIndexSchema },
  SitDown: {
    buyIn: ChipsSchema,
    player: PlayerIdSchema,
    seat: SeatIndexSchema,
  },
  StandUp: { seat: SeatIndexSchema },
  StartHand: { deck: DeckSchema, straddles: Schema.Array(SeatIndexSchema) },
  TableHand: { seat: SeatIndexSchema },
});

export type Command = typeof CommandSchema.Type;

export const Commands = Data.taggedEnum<Command>();

export type CommandOf<Tag extends Command["_tag"]> = Data.TaggedEnum.Value<
  Command,
  Tag
>;
