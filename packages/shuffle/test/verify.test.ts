import { describe, expect, it } from "@effect/vitest";
import { Option, Result, Schema } from "effect";

import {
  BeaconRoundMismatch,
  CardSchema,
  DealIndexSchema,
  DealtSeatsDiffer,
  OpeningMismatch,
  openCard,
  PositionSchema,
  RandomnessSchema,
  RoleOutOfRange,
  Roles,
  SaltSchema,
  ShownCardDiffers,
  SpareDeckMismatch,
  SpareDeckRepeatsCard,
  verifyHand,
  WrongPosition,
} from "../src/index.js";
import type { PlayerSaw, Sighting } from "../src/index.js";
import { between } from "./arbitraries.js";
import {
  dealtInOf,
  everything,
  honestHand,
  keepFlags,
  pickedFrom,
  sawOf,
} from "./hands.js";
import type { HonestHand } from "./hands.js";

const outcome = (saw: PlayerSaw) =>
  Result.match(verifyHand(saw), {
    onFailure: (rejected) => rejected,
    onSuccess: (verified) => verified,
  });

const sightingAt = (hand: HonestHand, dealIndex: number): Sighting =>
  Option.getOrThrow(Option.fromNullishOr(hand.dealt[dealIndex]));

const replaceAt = (
  sightings: readonly Sighting[],
  dealIndex: number,
  replacement: Sighting
) =>
  sightings.map((sighting, index) =>
    index === dealIndex ? replacement : sighting
  );

const nudged = (bytes: Uint8Array, spot: number, by: number) =>
  bytes.map((byte, index) => (index === spot ? (byte + by) % 256 : byte));

describe("verifyHand on honest hands", () => {
  it.prop(
    "accepts every honest hand from what any one player could have seen, including nothing",
    { hand: honestHand, keep: keepFlags },
    ({ hand, keep }) => {
      const seen = pickedFrom(hand, keep);
      const verified = verifyHand(sawOf(hand, seen));

      expect(Result.isSuccess(verified)).toBe(true);

      expect(
        verified.pipe(
          Result.map(({ checked, dealtSlot }) => ({ checked, dealtSlot }))
        )
      ).toEqual(
        Result.succeed({
          checked: seen.length,
          dealtSlot: hand.plan.dealtSlot,
        })
      );
    }
  );
});

describe("verifyHand on a changed hand", () => {
  it.prop(
    "names the position when an opened card changed",
    { by: between(1, 51), dealIndex: between(0, 51), hand: honestHand },
    ({ by, dealIndex, hand }) => {
      const honest = sightingAt(hand, dealIndex);
      const card = CardSchema.make((honest.opening.card + by) % 52);

      const changed = {
        ...honest,
        opening: { ...honest.opening, card },
        shown: card,
      };

      expect(
        outcome(sawOf(hand, replaceAt(hand.dealt, dealIndex, changed)))
      ).toEqual(
        new OpeningMismatch({
          position: honest.opening.position,
          slot: hand.plan.dealtSlot,
        })
      );
    }
  );

  it.prop(
    "names the position when a salt changed",
    {
      by: between(1, 255),
      dealIndex: between(0, 51),
      hand: honestHand,
      spot: between(0, 31),
    },
    ({ by, dealIndex, hand, spot }) => {
      const honest = sightingAt(hand, dealIndex);

      const changed = {
        ...honest,
        opening: {
          ...honest.opening,
          salt: SaltSchema.make(nudged(honest.opening.salt, spot, by)),
        },
      };

      expect(outcome(sawOf(hand, [changed]))).toEqual(
        new OpeningMismatch({
          position: honest.opening.position,
          slot: hand.plan.dealtSlot,
        })
      );
    }
  );

  it.prop(
    "names the deal when the table shows a card other than the sealed one",
    { by: between(1, 51), dealIndex: between(0, 51), hand: honestHand },
    ({ by, dealIndex, hand }) => {
      const honest = sightingAt(hand, dealIndex);
      const shown = CardSchema.make((honest.shown + by) % 52);

      expect(outcome(sawOf(hand, [{ ...honest, shown }]))).toEqual(
        new ShownCardDiffers({
          dealIndex: DealIndexSchema.make(dealIndex),
          opened: honest.opening.card,
          shown,
        })
      );
    }
  );

  it.prop(
    "names both positions when a real sealed card is dealt from the wrong place",
    { dealIndex: between(0, 51), hand: honestHand, other: between(1, 51) },
    ({ dealIndex, hand, other }) => {
      const honest = sightingAt(hand, dealIndex);

      const elsewhere = PositionSchema.make(
        (honest.opening.position + other) % 52
      );

      const opening = Option.getOrThrow(
        openCard(hand.sealed.decks[hand.plan.dealtSlot], elsewhere)
      );

      expect(
        outcome(sawOf(hand, [{ ...honest, opening, shown: opening.card }]))
      ).toEqual(
        new WrongPosition({
          dealIndex: DealIndexSchema.make(dealIndex),
          expected: honest.opening.position,
          opened: elsewhere,
        })
      );
    }
  );

  it.prop(
    "catches two dealt cards swapped with each other at the first one seen",
    { first: between(0, 51), hand: honestHand, step: between(1, 51) },
    ({ first, hand, step }) => {
      const second = (first + step) % 52;
      const one = sightingAt(hand, first);
      const two = sightingAt(hand, second);

      const swapped = replaceAt(
        replaceAt(hand.dealt, first, {
          ...one,
          opening: two.opening,
          shown: two.shown,
        }),
        second,
        { ...two, opening: one.opening, shown: one.shown }
      );

      const earlier = Math.min(first, second);
      const later = Math.max(first, second);
      const earlierSighting = sightingAt(hand, earlier);
      const laterSighting = sightingAt(hand, later);

      expect(outcome(sawOf(hand, swapped))).toEqual(
        new WrongPosition({
          dealIndex: DealIndexSchema.make(earlier),
          expected: earlierSighting.opening.position,
          opened: laterSighting.opening.position,
        })
      );
    }
  );

  it.prop(
    "fails for an observer of every card when the beacon's randomness changed",
    { by: between(1, 255), hand: honestHand, spot: between(0, 31) },
    ({ by, hand, spot }) => {
      const beacon = {
        ...hand.beacon,
        randomness: RandomnessSchema.make(
          nudged(hand.beacon.randomness, spot, by)
        ),
      };

      const rejected = outcome({ ...everything(hand), beacon });

      expect(
        Schema.is(SpareDeckMismatch)(rejected) ||
          Schema.is(WrongPosition)(rejected)
      ).toBe(true);
    }
  );

  it.prop(
    "rejects a beacon round other than the sealed one",
    { hand: honestHand, shift: between(1, 1000) },
    ({ hand, shift }) => {
      const used = hand.beacon.round + shift;

      expect(
        outcome({
          ...everything(hand),
          beacon: { ...hand.beacon, round: used },
        })
      ).toEqual(new BeaconRoundMismatch({ sealed: hand.beacon.round, used }));
    }
  );

  it.prop(
    "rejects a deal to seats other than the sealed ones, in another order, or one seat short",
    { extra: between(0, 8), hand: honestHand },
    ({ extra, hand }) => {
      const sealed = hand.sealed.seal.seats;

      const changed = [
        sealed.toReversed(),
        sealed.slice(1),
        sealed.includes(extra) ? sealed.slice(0, -1) : [...sealed, extra],
      ].filter((dealt) => dealt.join(",") !== sealed.join(","));

      for (const dealt of changed) {
        expect(outcome({ ...everything(hand), seats: dealt })).toEqual(
          new DealtSeatsDiffer({ dealt, sealed })
        );
      }
    }
  );

  it.prop(
    "rejects a spare deck that repeats a card or differs from the sealed one",
    { from: between(0, 51), hand: honestHand, to: between(0, 51) },
    ({ from, hand, to }) => {
      const { cards } = hand.spare;
      const moved = cards[from] ?? CardSchema.make(0);

      const repeating = cards.map((card, index) =>
        index === to && to !== from ? moved : card
      );

      const swapped = cards.map((card, index) => {
        if (index === from) {
          return cards[to] ?? card;
        }

        return index === to ? moved : card;
      });

      expect(
        outcome({
          ...everything(hand),
          spare: { ...hand.spare, cards: repeating },
        })
      ).toEqual(
        from === to
          ? outcome(everything(hand))
          : new SpareDeckRepeatsCard({ card: moved, slot: hand.plan.spareSlot })
      );

      expect(
        outcome({
          ...everything(hand),
          spare: { ...hand.spare, cards: swapped },
        })
      ).toEqual(
        from === to
          ? outcome(everything(hand))
          : new SpareDeckMismatch({ slot: hand.plan.spareSlot })
      );
    }
  );

  it.prop(
    "rejects a hole card for a turn past the players dealt in, or a board card past the deck",
    { hand: honestHand },
    ({ hand }) => {
      const [first] = hand.dealt;

      if (first === undefined) {
        return;
      }

      const dealtIn = dealtInOf(hand);
      const pastDeck = Roles.Community({ drawn: 52 - 2 * dealtIn });

      const pastPlayers =
        dealtIn < 9 ? [Roles.Hole({ pass: 1, turn: dealtIn })] : [];

      for (const role of [...pastPlayers, pastDeck]) {
        expect(outcome(sawOf(hand, [{ ...first, role }]))).toEqual(
          new RoleOutOfRange({ dealtIn, role })
        );
      }
    }
  );
});
