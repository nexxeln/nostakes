import { Data, Schema } from "effect";

import { CardSchema, DeckSchema } from "./cards.js";
import { ChipsSchema, PlayerIdSchema, SeatIndexSchema } from "./primitives.js";
import { TableConfigSchema } from "./rules.js";
import { StreetSchema } from "./state.js";

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
  Called: {
    allIn: Schema.Boolean,
    amount: ChipsSchema,
    seat: SeatIndexSchema,
  },
  Checked: { seat: SeatIndexSchema },
  ChipsAdded: { amount: ChipsSchema, seat: SeatIndexSchema },
  Folded: { seat: SeatIndexSchema },
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
  RaisedTo: {
    added: ChipsSchema,
    allIn: Schema.Boolean,
    full: Schema.Boolean,
    seat: SeatIndexSchema,
    to: ChipsSchema,
  },
  RulesChanged: { config: TableConfigSchema },
  SittingOutChanged: { seat: SeatIndexSchema, sittingOut: Schema.Boolean },
  StraddlePosted: { amount: ChipsSchema, seat: SeatIndexSchema },
  StreetDealt: {
    cards: Schema.Array(CardSchema),
    run: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    street: StreetSchema,
  },
  UncalledBetReturned: { amount: ChipsSchema, seat: SeatIndexSchema },
});

export type Event = typeof EventSchema.Type;

export const Events = Data.taggedEnum<Event>();

export type EventOf<Tag extends Event["_tag"]> = Data.TaggedEnum.Value<
  Event,
  Tag
>;
