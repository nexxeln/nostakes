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

export const RoomSettingsSchema = Schema.Struct({
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
  turnSeconds: wholeSeconds(0, MAX_CLOCK_SECONDS).annotate({
    description:
      "Seconds a player has to act on their turn. 0 turns the clock off.",
    title: "Turn clock",
  }),
});

export type RoomSettings = typeof RoomSettingsSchema.Type;

export const turnClockRuns = (settings: RoomSettings) =>
  settings.turnSeconds > 0;
