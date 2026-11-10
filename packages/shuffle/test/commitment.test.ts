import { describe, expect, it } from "@effect/vitest";
import { Option, Result } from "effect";
import * as Hex from "effect/encoding/Hex";

import {
  CardSchema,
  deckRoot,
  openCard,
  openDeck,
  OpeningMismatch,
  PositionSchema,
  SaltSchema,
  sealDeck,
  verifyOpening,
} from "../src/index.js";
import type { Opening, SealedDeck } from "../src/index.js";
import {
  between,
  deck,
  handContext,
  position,
  saltSecret,
  slot,
} from "./arbitraries.js";

const opened = (sealed: SealedDeck, at: number) =>
  Option.getOrThrow(openCard(sealed, PositionSchema.make(at)));

const verifies = (sealed: SealedDeck, opening: Opening) =>
  Result.isSuccess(
    verifyOpening(sealed.context, sealed.slot, sealed.root, opening)
  );

const failure = (sealed: SealedDeck, opening: Opening) =>
  Result.match(
    verifyOpening(sealed.context, sealed.slot, sealed.root, opening),
    { onFailure: (rejected) => rejected, onSuccess: () => {} }
  );

const sealed = { context: handContext, deck, secret: saltSecret, slot };

describe("sealing a deck", () => {
  it.prop(
    "opens every position of an honestly sealed deck",
    sealed,
    ({ context, deck: cards, secret, slot: which }) => {
      const sealedDeck = sealDeck(context, which, cards, secret);

      for (let at = 0; at < 52; at += 1) {
        const opening = opened(sealedDeck, at);

        expect(opening.card).toBe(cards[at]);
        expect(verifies(sealedDeck, opening)).toBe(true);
      }
    }
  );

  it.prop(
    "rejects an opening whose card, salt, or position changed, naming the position and deck",
    { ...sealed, at: position, other: between(1, 51), spot: between(0, 31) },
    ({ at, context, deck: cards, other, secret, slot: which, spot }) => {
      const sealedDeck = sealDeck(context, which, cards, secret);
      const opening = opened(sealedDeck, at);
      const expected = new OpeningMismatch({ position: at, slot: which });

      const otherCard = CardSchema.make((opening.card + other) % 52);

      const otherSalt = SaltSchema.make(
        opening.salt.map((byte, place) =>
          place === spot ? (byte + other) % 256 : byte
        )
      );

      const elsewhere = PositionSchema.make((at + other) % 52);

      expect(failure(sealedDeck, { ...opening, card: otherCard })).toEqual(
        expected
      );

      expect(failure(sealedDeck, { ...opening, salt: otherSalt })).toEqual(
        expected
      );

      expect(
        failure(sealedDeck, { ...opening, position: elsewhere })
      ).toBeInstanceOf(OpeningMismatch);
    }
  );

  it.prop(
    "never gives two hands, two rooms, or the two decks of one hand the same root, even with the same cards and secret",
    sealed,
    ({ context, deck: cards, secret, slot: which }) => {
      const roots = [
        sealDeck(context, which, cards, secret),
        sealDeck({ ...context, hand: context.hand + 1 }, which, cards, secret),
        sealDeck(
          { ...context, room: `${context.room}X` },
          which,
          cards,
          secret
        ),
        sealDeck(context, which === 0 ? 1 : 0, cards, secret),
      ].map(({ root }) => Hex.encode(root));

      expect(new Set(roots).size).toBe(4);
    }
  );

  it.prop(
    "rejects an opening from one hand replayed against the next hand's root",
    { ...sealed, at: position },
    ({ at, context, deck: cards, secret, slot: which }) => {
      const earlier = sealDeck(context, which, cards, secret);

      const later = sealDeck(
        { ...context, hand: context.hand + 1 },
        which,
        cards,
        secret
      );

      expect(verifies(later, opened(earlier, at))).toBe(false);
    }
  );

  it.prop(
    "recomputes the sealed root from a whole-deck opening",
    sealed,
    ({ context, deck: cards, secret, slot: which }) => {
      const sealedDeck = sealDeck(context, which, cards, secret);

      expect(Hex.encode(deckRoot(context, which, openDeck(sealedDeck)))).toBe(
        Hex.encode(sealedDeck.root)
      );
    }
  );
});
