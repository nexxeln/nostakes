import { describe, expect, it } from "@effect/vitest";
import { Option, Result, Schema } from "effect";

import {
  BeaconRoundMismatch,
  CardSchema,
  Contributions,
  DealIndexSchema,
  DuplicateContribution,
  MyContributionAltered,
  MyContributionLeftOut,
  NoOutsideRandomness,
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

  it.prop(
    "accepts a player's own contribution when it was used as sent",
    { hand: honestHand },
    ({ hand }) => {
      const mine = hand.contributions.find(Contributions.$is("Player"));

      expect(
        Result.isSuccess(
          verifyHand(sawOf(hand, hand.dealt, Option.fromNullishOr(mine)))
        )
      ).toBe(true);
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
    "fails for an observer of every card when any one contribution changed",
    {
      by: between(1, 255),
      hand: honestHand,
      pick: between(0, 9),
      spot: between(0, 31),
    },
    ({ by, hand, pick, spot }) => {
      const target = pick % hand.contributions.length;

      const changed = hand.contributions.map((contribution, index) =>
        index === target
          ? Contributions.$match(contribution, {
              Beacon: (beacon) =>
                Contributions.Beacon({
                  ...beacon,
                  randomness: RandomnessSchema.make(
                    nudged(beacon.randomness, spot, by)
                  ),
                }),
              Player: (player) =>
                Contributions.Player({
                  ...player,
                  value: RandomnessSchema.make(nudged(player.value, spot, by)),
                }),
            })
          : contribution
      );

      const rejected = outcome({ ...everything(hand), contributions: changed });

      expect(
        Schema.is(SpareDeckMismatch)(rejected) ||
          Schema.is(WrongPosition)(rejected)
      ).toBe(true);
    }
  );

  it.prop(
    "tells a player when the value their device sent was left out or altered",
    { by: between(1, 255), hand: honestHand, spot: between(0, 31) },
    ({ by, hand, spot }) => {
      const mine = hand.contributions.find(Contributions.$is("Player"));

      if (mine === undefined) {
        return;
      }

      const others = hand.contributions.filter(
        (contribution) => contribution !== mine
      );

      const altered = Contributions.Player({
        ...mine,
        value: RandomnessSchema.make(nudged(mine.value, spot, by)),
      });

      expect(
        outcome({
          ...sawOf(hand, [], Option.some(mine)),
          contributions: others,
        })
      ).toEqual(
        others.length === 0
          ? new NoOutsideRandomness({ hand: hand.sealed.context.hand })
          : new MyContributionLeftOut({ seat: mine.seat })
      );

      expect(
        outcome({
          ...sawOf(hand, [], Option.some(mine)),
          contributions: [...others, altered],
        })
      ).toEqual(new MyContributionAltered({ seat: mine.seat }));
    }
  );

  it.prop(
    "rejects a source that contributed twice",
    { hand: honestHand },
    ({ hand }) => {
      const [first] = hand.contributions;

      if (first === undefined) {
        return;
      }

      expect(
        outcome({
          ...everything(hand),
          contributions: [...hand.contributions, first],
        })
      ).toBeInstanceOf(DuplicateContribution);
    }
  );

  it.prop(
    "rejects a beacon round other than the sealed one",
    { hand: honestHand, shift: between(1, 1000) },
    ({ hand, shift }) => {
      const contributions = hand.contributions.map((contribution) =>
        Contributions.$match(contribution, {
          Beacon: (beacon) =>
            Contributions.Beacon({ ...beacon, round: beacon.round + shift }),
          Player: (player) => player,
        })
      );

      const beacon = hand.contributions.find(Contributions.$is("Beacon"));

      expect(outcome({ ...everything(hand), contributions })).toEqual(
        beacon === undefined
          ? outcome(everything(hand))
          : new BeaconRoundMismatch({
              sealed: Option.some(beacon.round),
              used: Option.some(beacon.round + shift),
            })
      );
    }
  );

  it.prop(
    "refuses to call an order fair when nothing outside the server chose it",
    { hand: honestHand },
    ({ hand }) => {
      expect(
        outcome({
          ...everything(hand),
          contributions: [],
          seal: { ...hand.sealed.seal, beaconRound: Option.none() },
        })
      ).toEqual(new NoOutsideRandomness({ hand: hand.sealed.context.hand }));
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

      const pastDeck = Roles.Community({ drawn: 52 - 2 * hand.dealtIn });

      const pastPlayers =
        hand.dealtIn < 9 ? [Roles.Hole({ pass: 1, turn: hand.dealtIn })] : [];

      for (const role of [...pastPlayers, pastDeck]) {
        expect(outcome(sawOf(hand, [{ ...first, role }]))).toEqual(
          new RoleOutOfRange({ dealtIn: hand.dealtIn, role })
        );
      }
    }
  );
});
