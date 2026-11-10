import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  CardSchema,
  DECK_SIZE,
  DeckSchema,
  DeckSlotSchema,
  DIGEST_BYTES,
  DigestSchema,
  PositionSchema,
  SaltSecretSchema,
} from "../src/index.js";

export const between = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ maximum, minimum })));

export const bytesOfLength = (length: number) =>
  Arbitrary.array(between(0, 255), {
    maxLength: length,
    minLength: length,
  }).pipe(Arbitrary.map((values) => Uint8Array.from(values)));

export const bytesUpTo = (maximum: number) =>
  between(0, maximum).pipe(Arbitrary.flatMap(bytesOfLength));

export const permutationOf = (size: number) =>
  Arbitrary.array(between(0, 2 ** 31), {
    maxLength: size,
    minLength: size,
  }).pipe(
    Arbitrary.map((draws) => {
      const items = Array.from({ length: size }, (_, index) => index);

      for (let top = size - 1; top > 0; top -= 1) {
        const pick = (draws[top] ?? 0) % (top + 1);
        const held = items[top] ?? top;

        items[top] = items[pick] ?? pick;
        items[pick] = held;
      }

      return items;
    })
  );

export const deck = permutationOf(DECK_SIZE).pipe(
  Arbitrary.map((cards) =>
    DeckSchema.make(cards.map((card) => CardSchema.make(card)))
  )
);

export const saltSecret = bytesOfLength(DIGEST_BYTES).pipe(
  Arbitrary.map((bytes) => SaltSecretSchema.make(bytes))
);

export const digest = bytesOfLength(DIGEST_BYTES).pipe(
  Arbitrary.map((bytes) => DigestSchema.make(bytes))
);

export const handContext = Arbitrary.all({
  hand: between(1, 100_000),
  room: Arbitrary.schema(
    Schema.String.check(Schema.isPattern(/^[A-Z2-9]{6}$/u))
  ),
});

export const position = between(0, DECK_SIZE - 1).pipe(
  Arbitrary.map((value) => PositionSchema.make(value))
);

export const slot = Arbitrary.schema(DeckSlotSchema);
