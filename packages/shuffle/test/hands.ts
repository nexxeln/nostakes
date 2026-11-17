import { Array as Arr, Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  DealIndexSchema,
  DECK_SIZE,
  dealingPlan,
  holeCardsOf,
  MAX_DEALT_IN,
  MOST_HOLE_CARDS,
  openDealt,
  openSpare,
  RandomnessSchema,
  Roles,
  sealHand,
  seedOf,
  TWO_HOLE_CARDS,
} from "../src/index.js";
import type {
  Beacon,
  DealingPlan,
  DeckOpening,
  PlayerSaw,
  Role,
  SealedHand,
  Seats,
  Sighting,
} from "../src/index.js";
import {
  between,
  bytesOfLength,
  deck,
  handContext,
  permutationOf,
  saltSecret,
} from "./arbitraries.js";

export interface HonestHand {
  readonly sealed: SealedHand;
  readonly beacon: Beacon;
  readonly plan: DealingPlan;
  readonly spare: DeckOpening;
  readonly dealt: readonly Sighting[];
}

export const randomness = bytesOfLength(32).pipe(
  Arbitrary.map((bytes) => RandomnessSchema.make(bytes))
);

export const seats = Arbitrary.all({
  count: between(2, MAX_DEALT_IN),
  order: permutationOf(MAX_DEALT_IN),
}).pipe(Arbitrary.map(({ count, order }): Seats => order.slice(0, count)));

export const rolesFor = (
  dealtIn: number,
  holeCards: number = TWO_HOLE_CARDS
): readonly Role[] => [
  ...Arr.range(0, holeCards - 1).flatMap((pass) =>
    Arr.range(0, dealtIn - 1).map((turn) => Roles.Hole({ pass, turn }))
  ),
  ...Arr.range(0, DECK_SIZE - holeCards * dealtIn - 1).map((drawn) =>
    Roles.Community({ drawn })
  ),
];

export const dealHonestly = (
  sealed: SealedHand,
  beacon: Beacon
): HonestHand => {
  const plan = dealingPlan(seedOf(sealed.context, sealed.seal, beacon));

  const dealt = rolesFor(
    sealed.seal.seats.length,
    holeCardsOf(sealed.seal)
  ).map((role, dealIndex) => {
    const opening = Option.getOrThrow(
      openDealt(sealed, plan, DealIndexSchema.make(dealIndex))
    );

    return { opening, role, shown: opening.card };
  });

  return { beacon, dealt, plan, sealed, spare: openSpare(sealed, plan) };
};

export const sawOf = (
  hand: HonestHand,
  sightings: readonly Sighting[]
): PlayerSaw => ({
  beacon: hand.beacon,
  context: hand.sealed.context,
  seal: hand.sealed.seal,
  seats: hand.sealed.seal.seats,
  sightings,
  spare: hand.spare,
});

export const everything = (hand: HonestHand) => sawOf(hand, hand.dealt);

export const honestHand = Arbitrary.all({
  beacon: Arbitrary.all({ randomness, round: between(1, 10_000_000) }),
  context: handContext,
  decks: Arbitrary.all([deck, deck]),
  holeCards: between(1, MOST_HOLE_CARDS),
  seats,
  secret: saltSecret,
}).pipe(
  Arbitrary.map(
    ({ beacon, context, decks, holeCards, seats: dealtIn, secret }) =>
      dealHonestly(
        sealHand(context, decks, secret, beacon.round, dealtIn, holeCards),
        beacon
      )
  )
);

export const pickedFrom = (
  hand: HonestHand,
  keep: readonly boolean[]
): readonly Sighting[] => hand.dealt.filter((_, index) => keep[index] === true);

export const keepFlags = Arbitrary.array(Arbitrary.schema(Schema.Boolean), {
  maxLength: DECK_SIZE,
  minLength: DECK_SIZE,
});

export const dealtInOf = (hand: HonestHand) => hand.sealed.seal.seats.length;
