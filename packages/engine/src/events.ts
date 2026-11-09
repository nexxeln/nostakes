import { Data, Schema } from "effect";

import { ChipsSchema, PlayerIdSchema, SeatIndexSchema } from "./primitives.js";
import { TableConfigSchema } from "./rules.js";

export const EventSchema = Schema.TaggedUnion({
  ChipsAdded: { amount: ChipsSchema, seat: SeatIndexSchema },
  PlayerSat: {
    buyIn: ChipsSchema,
    player: PlayerIdSchema,
    seat: SeatIndexSchema,
  },
  PlayerStood: {
    player: PlayerIdSchema,
    seat: SeatIndexSchema,
    stack: ChipsSchema,
  },
  RulesChanged: { config: TableConfigSchema },
  SittingOutChanged: { seat: SeatIndexSchema, sittingOut: Schema.Boolean },
});

export type Event = typeof EventSchema.Type;

export const Events = Data.taggedEnum<Event>();

export type EventOf<Tag extends Event["_tag"]> = Data.TaggedEnum.Value<
  Event,
  Tag
>;
