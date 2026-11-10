import { Schema } from "effect";

export const ChipsSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("Chips"));

export type Chips = typeof ChipsSchema.Type;

export const PositiveChipsSchema = ChipsSchema.check(Schema.isGreaterThan(0));

export const chips = (amount: number) => ChipsSchema.make(amount);

export const NO_CHIPS = chips(0);

export const CHIP_LIMIT = chips(Number.MAX_SAFE_INTEGER);

export const SEAT_COUNT = 9;

export const SeatIndexSchema = Schema.Int.check(
  Schema.isBetween({ maximum: SEAT_COUNT - 1, minimum: 0 })
).pipe(Schema.brand("SeatIndex"));

export type SeatIndex = typeof SeatIndexSchema.Type;

export const SEAT_INDEXES: readonly SeatIndex[] = Array.from(
  { length: SEAT_COUNT },
  (_, seat) => SeatIndexSchema.make(seat)
);

export const seatAt = (index: number) =>
  SEAT_INDEXES[index % SEAT_COUNT] ?? SeatIndexSchema.make(index % SEAT_COUNT);

export const seatsClockwiseAfter = (seat: SeatIndex) =>
  Array.from({ length: SEAT_COUNT }, (_, step) => seatAt(seat + step + 1));

export const PlayerIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("PlayerId")
);

export type PlayerId = typeof PlayerIdSchema.Type;

const splitSteps = (amount: number, parts: number) => {
  const steps: { readonly chips: number; readonly shares: number }[] = [];

  for (
    let step = { chips: parts, shares: 1 };
    step.chips <= amount;
    step = { chips: step.chips + step.chips, shares: step.shares + step.shares }
  ) {
    steps.push(step);
  }

  return steps;
};

export const splitEvenly = (amount: Chips, parts: number) => {
  let share = 0;
  let remainder: number = amount;

  for (const step of splitSteps(amount, parts).toReversed()) {
    if (remainder >= step.chips) {
      remainder -= step.chips;
      share += step.shares;
    }
  }

  return { remainder, share: chips(share) };
};
