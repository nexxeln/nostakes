import {
  ChipsSchema,
  SEAT_COUNT,
  TableConfigSchema,
  setting,
} from "@nostakes/engine";
import { Data, Schema } from "effect";

export const MAX_CHIP_AMOUNT = 1_000_000_000;

export const ChipAmountSchema = ChipsSchema.check(
  Schema.isBetween({ maximum: MAX_CHIP_AMOUNT, minimum: 1 })
);

export const BuyInRangeSchema = Schema.Struct({
  max: ChipAmountSchema.annotate({
    description:
      "The most a player may sit down with. A top-up may not take a stack above it.",
    title: "Largest buy-in",
  }),
  min: ChipAmountSchema.annotate({
    description: "The least a player may sit down with.",
    title: "Smallest buy-in",
  }),
}).check(
  Schema.makeFilter((range) =>
    range.min <= range.max
      ? undefined
      : "the smallest buy-in must not exceed the largest"
  )
);

export type BuyInRange = typeof BuyInRangeSchema.Type;

const wholeSeconds = (minimum: number, maximum: number) =>
  Schema.Int.check(Schema.isBetween({ maximum, minimum }));

export const MAX_CLOCK_SECONDS = 3600;

export const MAX_TIME_BANK_SECONDS = 86_400;

export const DEFAULT_SHOWDOWN_SECONDS = 15;

export const MAX_REFILL_HANDS = 1000;

export const TimeBankRefillSchema = Schema.TaggedUnion({
  NoRefill: {},
  Refill: {
    everyHands: Schema.Int.check(
      Schema.isBetween({ maximum: MAX_REFILL_HANDS, minimum: 1 })
    ).annotate({
      description:
        "A player's bank grows after every this many hands they are dealt.",
      title: "Every this many hands",
    }),
    seconds: wholeSeconds(1, MAX_CLOCK_SECONDS).annotate({
      description: "Seconds each refill adds to the bank.",
      title: "Seconds added",
    }),
    upTo: wholeSeconds(1, MAX_TIME_BANK_SECONDS).annotate({
      description: "A refill never takes a bank above this many seconds.",
      title: "Most seconds in a bank",
    }),
  },
});

export type TimeBankRefill = typeof TimeBankRefillSchema.Type;

export const TimeBankRefills = Data.taggedEnum<TimeBankRefill>();

export const MAX_TIMEOUTS_IN_A_ROW = 20;

export const DEFAULT_PAUSE_WHEN_AWAY_SECONDS = 120;

export const MIN_SEATS = 2;

export const SeatCountSchema = Schema.Int.check(
  Schema.isBetween({ maximum: SEAT_COUNT, minimum: MIN_SEATS })
);

export const ApprovalSchema = Schema.Struct({
  chips: Schema.Boolean.annotate({
    description:
      "The host approves every buy-in and top-up from another player before the chips arrive.",
    title: "Approve chips",
  }),
  seats: Schema.Boolean.annotate({
    description:
      "The host approves every player who asks for a seat before they sit down.",
    title: "Approve seats",
  }),
});

export const TopUpRuleSchema = Schema.Literals([
  "UpToMax",
  "BelowMin",
  "WhenBust",
]);

export type TopUpRule = typeof TopUpRuleSchema.Type;

export const LeavingMidHandSchema = Schema.Literals(["ActedFor", "PlaysOn"]);

export type LeavingMidHand = typeof LeavingMidHandSchema.Type;

export const DealingSchema = Schema.Literals(["Automatic", "Host"]);

export type Dealing = typeof DealingSchema.Type;

export const ShuffleSchema = Schema.Literals(["Checked", "Plain"]);

export const MomentCalloutsSchema = Schema.Literals([
  "All",
  "SkipPainful",
  "Off",
]);

export type MomentCallouts = typeof MomentCalloutsSchema.Type;

export type Shuffle = typeof ShuffleSchema.Type;

const settingsFields = (shuffleWhenAbsent: Shuffle) => ({
  approval: ApprovalSchema.annotate({
    description: "What the host must approve before it happens.",
    title: "Approval",
  }),
  betweenHandsSeconds: wholeSeconds(0, MAX_CLOCK_SECONDS).annotate({
    description:
      "Seconds between the end of a hand and the next deal. Players may show cards or rabbit hunt meanwhile.",
    title: "Pause between hands",
  }),
  buyIn: BuyInRangeSchema.annotate({
    description:
      "The smallest and largest number of chips a player may sit down with.",
    title: "Buy-in",
  }),
  dealing: setting(DealingSchema, "Automatic", {
    description:
      "Automatic deals the next hand once the pause after a hand is over. Host waits for the host to deal each hand.",
    title: "Who deals",
  }),
  leavingMidHand: setting(LeavingMidHandSchema, "ActedFor", {
    description:
      "What happens to a player who leaves their seat during a hand they are in. ActedFor: the room checks or folds for them whenever the action reaches them. PlaysOn: they play the hand out on their own clock, and stand up when it ends. A player who leaves the room is always acted for.",
    title: "Leaving during a hand",
  }),
  locked: setting(Schema.Boolean, false, {
    description:
      "Whether people new to the room may join. On: only people who already joined may come in, including someone who left and comes back with their pass. Off: anyone with the link may join.",
    title: "Locked",
  }),
  moments: setting(MomentCalloutsSchema, "All", {
    description:
      "Whether the table calls out a hand worth talking about once it ends: a big hand, a bluff shown, a hero call, a suckout, a split. All also calls out bad beats and coolers. SkipPainful leaves those two out, so nobody's loss gets a banner. Off calls out nothing.",
    title: "Table moments",
  }),
  pauseWhenAwaySeconds: setting(
    wholeSeconds(0, MAX_CLOCK_SECONDS),
    DEFAULT_PAUSE_WHEN_AWAY_SECONDS,
    {
      description:
        "Seconds the game keeps dealing once no seated player is connected. Then it pauses: the hand in play finishes on its clocks and no new hand is dealt until a seated player is back.",
      title: "Pause when everyone is away",
    }
  ),
  peeking: setting(Schema.Boolean, true, {
    description:
      "Whether the table sees when a player looks at their cards. While a player peeks, everyone else sees their face look down, as they would at a real table. Off keeps peeks to the player's own screen.",
    title: "Show peeks",
  }),
  runChoiceSeconds: wholeSeconds(1, MAX_CLOCK_SECONDS).annotate({
    description:
      "Seconds players have to vote on how many times to run the board. Anyone who has not voted runs it once.",
    title: "Run vote clock",
  }),
  seats: setting(SeatCountSchema, SEAT_COUNT, {
    description:
      "How many seats the table has, from 2 to 9. Players may sit only in the seats numbered below it.",
    title: "Seats",
  }),
  showdownSeconds: setting(
    wholeSeconds(1, MAX_CLOCK_SECONDS),
    DEFAULT_SHOWDOWN_SECONDS,
    {
      description:
        "Seconds a seat has to table or muck at an interactive showdown before the room decides for it.",
      title: "Showdown clock",
    }
  ),
  shuffle: setting(ShuffleSchema, shuffleWhenAbsent, {
    description:
      "Checked: before each hand the server seals two decks, and the order comes from a public drand beacon round named in the seal, so every player's device can check each card it was shown. Plain: the server shuffles alone and nobody can check the deck. A change applies from the next sealed hand.",
    title: "Fair shuffle",
  }),
  sitOutAfterTimeouts: setting(
    Schema.Int.check(
      Schema.isBetween({ maximum: MAX_TIMEOUTS_IN_A_ROW, minimum: 0 })
    ),
    1,
    {
      description:
        "A player who runs out of time this many turns in a row is sat out until they come back. 0 keeps them dealt in, checking or folding for them each time.",
      title: "Sit out after timeouts",
    }
  ),
  table: TableConfigSchema.annotate({
    description:
      "The rules of a hand. A change made during a hand applies from the next hand.",
    title: "Table rules",
  }),
  timeBankRefill: setting(TimeBankRefillSchema, TimeBankRefills.NoRefill(), {
    description:
      "Whether a player's time bank grows back during the night: never, or by some seconds every few hands they are dealt, up to a most.",
    title: "Time bank refill",
  }),
  timeBankSeconds: wholeSeconds(0, MAX_TIME_BANK_SECONDS).annotate({
    description:
      "Extra seconds each player may spend once their turn clock runs out.",
    title: "Time bank",
  }),
  topUps: setting(TopUpRuleSchema, "UpToMax", {
    description:
      "When a seated player may add chips. UpToMax: at any time, up to the largest buy-in. BelowMin: only between their hands, while below the smallest buy-in. WhenBust: only between their hands, once they have no chips left. Chips never take a stack past the largest buy-in.",
    title: "Top-ups",
  }),
  turnSeconds: wholeSeconds(0, MAX_CLOCK_SECONDS).annotate({
    description:
      "Seconds a player has to act on their turn. 0 turns the clock off.",
    title: "Turn clock",
  }),
});

export const RoomSettingsSchema = Schema.Struct(settingsFields("Plain"));

export const RequestedSettingsSchema = Schema.Struct(settingsFields("Checked"));

export type RoomSettings = typeof RoomSettingsSchema.Type;

export const turnClockRuns = (settings: RoomSettings) =>
  settings.turnSeconds > 0;
