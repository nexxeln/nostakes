import { Data, Schema } from "effect";

import { CardSchema, DeckSchema } from "./cards.js";
import { HandRankSchema } from "./evaluation.js";
import { ChipsSchema, PlayerIdSchema, SeatIndexSchema } from "./primitives.js";
import { RunCountSchema, TableConfigSchema } from "./rules.js";
import { StreetSchema } from "./state.js";

export const BlindSchema = Schema.Literals(["Small", "Big"]);

export type Blind = typeof BlindSchema.Type;

export const PotShareSchema = Schema.Struct({
  amount: ChipsSchema,
  seat: SeatIndexSchema,
});

export type PotShare = typeof PotShareSchema.Type;

export const ShowdownEntrySchema = Schema.TaggedUnion({
  Mucked: { seat: SeatIndexSchema },
  Shown: {
    cards: Schema.Array(CardSchema),
    rank: HandRankSchema,
    seat: SeatIndexSchema,
  },
});

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
    dead: Schema.optionalKey(Schema.Boolean),
    seat: SeatIndexSchema,
  },
  BountyPaid: {
    payers: Schema.Array(PotShareSchema),
    seat: SeatIndexSchema,
  },
  Called: {
    allIn: Schema.Boolean,
    amount: ChipsSchema,
    seat: SeatIndexSchema,
  },
  CardsShown: { cards: Schema.Array(CardSchema), seat: SeatIndexSchema },
  Checked: { seat: SeatIndexSchema },
  ChipsAdded: { amount: ChipsSchema, seat: SeatIndexSchema },
  Folded: { seat: SeatIndexSchema },
  HandEnded: { handNumber: Schema.Int },
  HandMucked: { seat: SeatIndexSchema },
  HandStarted: {
    bigBlindSeat: SeatIndexSchema,
    button: SeatIndexSchema,
    dealtIn: Schema.Array(SeatIndexSchema),
    deck: DeckSchema,
    handNumber: Schema.Int,
    smallBlindSeat: SeatIndexSchema,
  },
  HandTabled: {
    cards: Schema.Array(CardSchema),
    rank: HandRankSchema,
    seat: SeatIndexSchema,
  },
  HandsTabled: {
    hands: Schema.Array(
      Schema.Struct({ cards: Schema.Array(CardSchema), seat: SeatIndexSchema })
    ),
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
  PotAwarded: {
    amount: ChipsSchema,
    eligible: Schema.Array(SeatIndexSchema),
    pot: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    run: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    winners: Schema.Array(PotShareSchema),
  },
  RabbitHunted: { cards: Schema.Array(CardSchema) },
  RaisedTo: {
    added: ChipsSchema,
    allIn: Schema.Boolean,
    full: Schema.Boolean,
    seat: SeatIndexSchema,
    to: ChipsSchema,
  },
  RulesChanged: { config: TableConfigSchema },
  RunsAgreed: { runs: RunCountSchema },
  RunsChosen: { runs: RunCountSchema, seat: SeatIndexSchema },
  ShowdownReached: {
    order: Schema.Array(ShowdownEntrySchema),
    run: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  },
  ShowdownStarted: { order: Schema.Array(SeatIndexSchema) },
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
