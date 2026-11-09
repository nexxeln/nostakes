import { Data, Schema } from "effect";

import { CardSchema, DeckSchema } from "./cards.js";
import { ChipsSchema, PlayerIdSchema, SeatIndexSchema } from "./primitives.js";
import { TableConfigSchema } from "./rules.js";

export const BlindSchema = Schema.Literals(["Small", "Big"]);

export type Blind = typeof BlindSchema.Type;

export const EventSchema = Schema.TaggedUnion({
  AntePosted: {
    allIn: Schema.Boolean,
    amount: ChipsSchema,
    seat: SeatIndexSchema,
  },
  BlindPosted: {
    allIn: Schema.Boolean,
    amount: ChipsSchema,
    blind: BlindSchema,
    seat: SeatIndexSchema,
  },
  ChipsAdded: { amount: ChipsSchema, seat: SeatIndexSchema },
  HandStarted: {
    bigBlindSeat: SeatIndexSchema,
    button: SeatIndexSchema,
    dealtIn: Schema.Array(SeatIndexSchema),
    deck: DeckSchema,
    handNumber: Schema.Int,
    smallBlindSeat: SeatIndexSchema,
  },
  HoleCardsDealt: {
    cards: Schema.Array(CardSchema),
    seat: SeatIndexSchema,
  },
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
  StraddlePosted: { amount: ChipsSchema, seat: SeatIndexSchema },
});

export type Event = typeof EventSchema.Type;

export const Events = Data.taggedEnum<Event>();

export type EventOf<Tag extends Event["_tag"]> = Data.TaggedEnum.Value<
  Event,
  Tag
>;
