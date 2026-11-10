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
  key: Schema.Int,
  remainingMs: Schema.Int,
  seat: Schema.Int,
  totalMs: Schema.Int,
});

export type ActionClock = typeof ActionClockSchema.Type;

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
  Post: { amount: Schema.Int, label: Schema.String, seat: Schema.Int },
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

export const HintSchema = Schema.Literals(["Peek", "Fold", "Raise", "Keys"]);

export type Hint = typeof HintSchema.Type;

export const TableSnapshotSchema = Schema.Struct({
  afterHand: AfterHandSchema,
  bigBlind: Schema.Int,
  boards: Schema.Array(Schema.Array(CardTextSchema)),
  buttonSeat: Schema.NullOr(Schema.Int),
  clock: Schema.NullOr(ActionClockSchema),
  events: Schema.Array(TableEventSchema),
  handId: Schema.Int,
  heroCards: Schema.Array(CardTextSchema),
  heroSeat: Schema.NullOr(Schema.Int),
  hostTools: Schema.Boolean,
  learned: Schema.Array(HintSchema),
  legal: Schema.NullOr(HeroLegalSchema),
  pots: Schema.Array(Schema.Int),
  rabbit: Schema.Array(CardTextSchema),
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
  Pick: { seat: Schema.Int },
  Raise: { to: Schema.Int },
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
