import { describe, expect, it } from "@effect/vitest";
import { Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  CardFromText,
  CardSchema,
  DeckSchema,
  cardText,
  rankOf,
  suitOf,
} from "../src/index.js";

const decodeText = Schema.decodeUnknownSync(CardFromText);

const encodeText = Schema.encodeSync(CardFromText);

const isDeck = Schema.is(DeckSchema);

const orderedDeck = Array.from({ length: 52 }, (_, card) => card);

const permutation = Arbitrary.array(
  Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ maximum: 1e9, minimum: 0 }))
  ),
  { maxLength: 52, minLength: 52 }
).pipe(
  Arbitrary.map((keys) =>
    orderedDeck.toSorted(
      (left, right) => (keys[left] ?? 0) - (keys[right] ?? 0) || left - right
    )
  )
);

describe("cards", () => {
  it("encodes rank in card / 4 and suit in card % 4, deuce and clubs first", () => {
    expect(decodeText("2c")).toBe(0);
    expect(decodeText("2s")).toBe(3);
    expect(decodeText("3c")).toBe(4);
    expect(decodeText("Td")).toBe(33);
    expect(decodeText("Kh")).toBe(46);
    expect(decodeText("As")).toBe(51);
  });

  it("reads rank and suit back from the card number", () => {
    const aceOfSpades = decodeText("As");
    const sevenOfDiamonds = decodeText("7d");

    expect([rankOf(aceOfSpades), suitOf(aceOfSpades)]).toStrictEqual([12, 3]);
    expect([rankOf(sevenOfDiamonds), suitOf(sevenOfDiamonds)]).toStrictEqual([
      5, 1,
    ]);
  });

  it.prop(
    "every card survives a round trip through its text",
    { card: CardSchema },
    ({ card }) => {
      expect(decodeText(encodeText(card))).toBe(card);
      expect(cardText(card)).toBe(encodeText(card));
      expect(rankOf(card) * 4 + suitOf(card)).toBe(card);
    }
  );

  it("rejects text that names no card", () => {
    for (const text of ["1c", "Ax", "10h", "as", "", "AsK"]) {
      expect(Result.isFailure(Schema.decodeResult(CardFromText)(text))).toBe(
        true
      );
    }
  });

  it.prop(
    "a deck is any ordering of the 52 cards",
    { order: permutation },
    ({ order }) => {
      expect(isDeck(order)).toBe(true);
    }
  );

  it("rejects a deck with a missing, repeated, or foreign card", () => {
    expect(isDeck(orderedDeck.slice(1))).toBe(false);
    expect(isDeck([0, ...orderedDeck.slice(1, 51), 0])).toBe(false);
    expect(isDeck([...orderedDeck.slice(0, 51), 52])).toBe(false);
    expect(isDeck([...orderedDeck, 0])).toBe(false);
  });
});
