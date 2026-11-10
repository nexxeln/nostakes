import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

export const between = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ maximum, minimum })));

export const bytesOfLength = (length: number) =>
  Arbitrary.array(between(0, 255), {
    maxLength: length,
    minLength: length,
  }).pipe(Arbitrary.map((values) => Uint8Array.from(values)));

export const bytesUpTo = (maximum: number) =>
  between(0, maximum).pipe(Arbitrary.flatMap(bytesOfLength));
