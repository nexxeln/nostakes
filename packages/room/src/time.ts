import { Schema } from "effect";

export const MillisSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("Millis"));

export type Millis = typeof MillisSchema.Type;

export const millis = (amount: number) => MillisSchema.make(amount);

export const MILLIS_PER_SECOND = 1000;

export const secondsAfter = (start: Millis, seconds: number) =>
  millis(start + seconds * MILLIS_PER_SECOND);

export const wholeSecondsBetween = (start: Millis, end: Millis) =>
  Math.max(0, Math.ceil((end - start) / MILLIS_PER_SECOND));

export const latest = (left: Millis, right: Millis) =>
  left >= right ? left : right;
