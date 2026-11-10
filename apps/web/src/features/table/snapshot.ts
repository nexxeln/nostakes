import { ReactionSchema } from "@nostakes/room";
import { Schema } from "effect";
import { CustomElement } from "foldkit";

export const CardTextSchema = Schema.String;

export const SeatStatusSchema = Schema.Literals([
  "In",
  "Folded",
  "AllIn",
  "Out",
  "Empty",
]);

export type SeatStatus = typeof SeatStatusSchema.Type;

export const SeatSnapshotSchema = Schema.Struct({
  avatar: Schema.String,
  away: Schema.Boolean,
  bet: Schema.Int,
  cardsHeld: Schema.Int,
  name: Schema.String,
  note: Schema.String,
  peeking: Schema.Boolean,
  seat: Schema.Int,
  shown: Schema.Array(CardTextSchema),
  stack: Schema.Int,
  status: SeatStatusSchema,
});

export type SeatSnapshot = typeof SeatSnapshotSchema.Type;

export const RaiseRangeSchema = Schema.Struct({
  isBet: Schema.Boolean,
  max: Schema.Int,
  min: Schema.Int,
});

export const HeroLegalSchema = Schema.Struct({
  call: Schema.NullOr(Schema.Int),
  check: Schema.Boolean,
  fold: Schema.Boolean,
  muck: Schema.Boolean,
  raise: Schema.NullOr(RaiseRangeSchema),
  show: Schema.Boolean,
});

export type HeroLegal = typeof HeroLegalSchema.Type;

export const ActionClockSchema = Schema.Struct({
  key: Schema.String,
  remainingMs: Schema.Int,
  seat: Schema.Int,
  totalMs: Schema.Int,
});

export type ActionClock = typeof ActionClockSchema.Type;

export const PostKindSchema = Schema.Literals([
  "Ante",
  "SmallBlind",
  "BigBlind",
  "DeadSmallBlind",
  "Straddle",
]);

export type PostKind = typeof PostKindSchema.Type;

export const HappeningSchema = Schema.TaggedUnion({
  Bet: {
    added: Schema.Int,
    allIn: Schema.Boolean,
    seat: Schema.Int,
    to: Schema.Int,
  },
  Call: { added: Schema.Int, allIn: Schema.Boolean, seat: Schema.Int },
  Check: { seat: Schema.Int },
  Collect: { street: Schema.String },
  Deal: { cards: Schema.Int, seat: Schema.Int },
  Fold: { seat: Schema.Int },
  Muck: { seat: Schema.Int },
  Post: { amount: Schema.Int, kind: PostKindSchema, seat: Schema.Int },
  Return: { amount: Schema.Int, seat: Schema.Int },
  Say: { seat: Schema.Int, text: Schema.String },
  Show: {
    cards: Schema.Array(CardTextSchema),
    label: Schema.String,
    seat: Schema.Int,
  },
  Start: { hand: Schema.Int },
  Win: { amount: Schema.Int, seat: Schema.Int },
});

export type Happening = typeof HappeningSchema.Type;

export const Happenings = HappeningSchema.cases;

export const TableEventSchema = Schema.Struct({
  happening: HappeningSchema,
  id: Schema.Int,
});

export type TableEvent = typeof TableEventSchema.Type;

export const AfterHandSchema = Schema.Struct({
  bothOnly: Schema.Boolean,
  rabbit: Schema.Boolean,
  showable: Schema.Array(CardTextSchema),
});

export type AfterHand = typeof AfterHandSchema.Type;

export const PostedSchema = Schema.Literals([
  "SmallBlind",
  "BigBlind",
  "Straddle",
  "ToComeIn",
]);

export type Posted = typeof PostedSchema.Type;

export const SeatPostSchema = Schema.Struct({
  posted: PostedSchema,
  seat: Schema.Int,
  settled: Schema.Boolean,
});

export type SeatPost = typeof SeatPostSchema.Type;

export const EntryOfferSchema = Schema.Struct({
  action: Schema.String,
  line: Schema.String,
  note: Schema.String,
  post: Schema.Boolean,
});

export type EntryOffer = typeof EntryOfferSchema.Type;

export const ShownReactionSchema = Schema.Struct({
  id: Schema.Int,
  reaction: ReactionSchema,
  seat: Schema.NullOr(Schema.Int),
});

export type ShownReaction = typeof ShownReactionSchema.Type;

export const HintSchema = Schema.Literals(["Peek", "Fold", "Raise", "Keys"]);

export type Hint = typeof HintSchema.Type;

export const TableSnapshotSchema = Schema.Struct({
  afterHand: AfterHandSchema,
  bigBlind: Schema.Int,
  boards: Schema.Array(Schema.Array(CardTextSchema)),
  buttonSeat: Schema.NullOr(Schema.Int),
  clock: Schema.NullOr(ActionClockSchema),
  entry: Schema.NullOr(EntryOfferSchema),
  events: Schema.Array(TableEventSchema),
  handId: Schema.Int,
  heroCards: Schema.Array(CardTextSchema),
  heroSeat: Schema.NullOr(Schema.Int),
  hostTools: Schema.Boolean,
  learned: Schema.Array(HintSchema),
  legal: Schema.NullOr(HeroLegalSchema),
  posts: Schema.Array(SeatPostSchema),
  pots: Schema.Array(Schema.Int),
  rabbit: Schema.Array(CardTextSchema),
  reactions: Schema.Array(ShownReactionSchema),
  runVote: Schema.NullOr(Schema.Int),
  seats: Schema.Array(SeatSnapshotSchema),
  toAct: Schema.NullOr(Schema.Int),
  waiting: Schema.String,
});

export type TableSnapshot = typeof TableSnapshotSchema.Type;

export const TableIntentSchema = Schema.TaggedUnion({
  Call: {},
  Check: {},
  Fold: {},
  HuntRabbit: {},
  Learned: { hint: HintSchema },
  Muck: {},
  Peek: { looking: Schema.Boolean },
  Pick: { seat: Schema.Int },
  Posting: { post: Schema.Boolean },
  Raise: { to: Schema.Int },
  React: { reaction: ReactionSchema },
  Runs: { runs: Schema.Int },
  Show: {},
  ShowCards: { cards: Schema.Array(CardTextSchema) },
  Sit: { seat: Schema.Int },
});

export type TableIntent = typeof TableIntentSchema.Type;

export const TableIntents = TableIntentSchema.cases;

export const TABLE_TAG = "nostakes-table";

export const tableElement = CustomElement.define({
  events: { intent: TableIntentSchema },
  properties: { snapshot: TableSnapshotSchema, sound: Schema.Boolean },
  tag: TABLE_TAG,
});
