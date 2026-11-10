import { ChipsSchema, TableConfigSchema } from "@nostakes/engine";
import { Schema } from "effect";

export const MAX_CHIP_AMOUNT = 1_000_000_000;

export const ChipAmountSchema = ChipsSchema.check(
  Schema.isBetween({ maximum: MAX_CHIP_AMOUNT, minimum: 1 })
);

export const BuyInRangeSchema = Schema.Struct({
  max: ChipAmountSchema,
  min: ChipAmountSchema,
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

export const ApprovalSchema = Schema.Struct({
  chips: Schema.Boolean,
  seats: Schema.Boolean,
});

export const RoomSettingsSchema = Schema.Struct({
  approval: ApprovalSchema,
  betweenHandsSeconds: wholeSeconds(0, MAX_CLOCK_SECONDS),
  buyIn: BuyInRangeSchema,
  runChoiceSeconds: wholeSeconds(1, MAX_CLOCK_SECONDS),
  table: TableConfigSchema,
  timeBankSeconds: wholeSeconds(0, MAX_TIME_BANK_SECONDS),
  turnSeconds: wholeSeconds(0, MAX_CLOCK_SECONDS),
});

export type RoomSettings = typeof RoomSettingsSchema.Type;

export const clockRuns = (settings: RoomSettings) => settings.turnSeconds > 0;
