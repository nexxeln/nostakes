import { Schema } from "effect";

export const AmountSchema = Schema.Int.check(Schema.isGreaterThan(0)).pipe(
  Schema.brand("Amount")
);

export type Amount = typeof AmountSchema.Type;

export const NetSchema = Schema.Int.pipe(Schema.brand("Net"));

export type Net = typeof NetSchema.Type;
