import { Array as Arr, Option, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  combine,
  Contributions,
  DealIndexSchema,
  DECK_SIZE,
  dealingPlan,
  openDealt,
  openSpare,
  RandomnessSchema,
  Roles,
  sealHand,
} from "../src/index.js";
import type {
  Contribution,
  DealingPlan,
  DeckOpening,
  HandContext,
  PlayerContribution,
  PlayerSaw,
  Role,
  SealedHand,
  Sighting,
} from "../src/index.js";
import {
  between,
  bytesOfLength,
  deck,
  handContext,
  saltSecret,
} from "./arbitraries.js";

export interface HonestHand {
  readonly sealed: SealedHand;
  readonly contributions: readonly Contribution[];
  readonly plan: DealingPlan;
  readonly dealtIn: number;
  readonly spare: DeckOpening;
  readonly dealt: readonly Sighting[];
}

export const randomness = bytesOfLength(32).pipe(
  Arbitrary.map((bytes) => RandomnessSchema.make(bytes))
);

export const rolesFor = (dealtIn: number): readonly Role[] => [
  ...Arr.range(0, dealtIn - 1).map((turn) => Roles.Hole({ pass: 0, turn })),
  ...Arr.range(0, dealtIn - 1).map((turn) => Roles.Hole({ pass: 1, turn })),
  ...Arr.range(0, DECK_SIZE - 2 * dealtIn - 1).map((drawn) =>
    Roles.Community({ drawn })
  ),
];

export const dealHonestly = (
  sealed: SealedHand,
  contributions: readonly Contribution[],
  dealtIn: number
): HonestHand => {
  const seed = Result.getOrThrow(
    combine(sealed.context, sealed.seal, contributions)
  );

  const plan = dealingPlan(seed);

  const dealt = rolesFor(dealtIn).map((role, dealIndex) => {
    const opening = Option.getOrThrow(
      openDealt(sealed, plan, DealIndexSchema.make(dealIndex))
    );

    return { opening, role, shown: opening.card };
  });

  return {
    contributions,
    dealt,
    dealtIn,
    plan,
    sealed,
    spare: openSpare(sealed, plan),
  };
};

export const sawOf = (
  hand: HonestHand,
  sightings: readonly Sighting[],
  mine: Option.Option<PlayerContribution> = Option.none()
): PlayerSaw => ({
  context: hand.sealed.context,
  contributions: hand.contributions,
  dealtIn: hand.dealtIn,
  mine,
  seal: hand.sealed.seal,
  sightings,
  spare: hand.spare,
});

export const everything = (hand: HonestHand) => sawOf(hand, hand.dealt);

const playerValues = Arbitrary.array(
  Arbitrary.all({ joins: Arbitrary.schema(Schema.Boolean), value: randomness }),
  { maxLength: 9, minLength: 9 }
);

export const honestHand = Arbitrary.all({
  beacon: Arbitrary.all({
    randomness,
    round: between(1, 10_000_000),
    used: Arbitrary.schema(Schema.Boolean),
  }),
  context: handContext,
  dealtIn: between(2, 9),
  decks: Arbitrary.all([deck, deck]),
  players: playerValues,
  secret: saltSecret,
}).pipe(
  Arbitrary.map(({ beacon, context, dealtIn, decks, players, secret }) => {
    const playerContributions = players.flatMap(({ joins, value }, seat) =>
      joins && seat < dealtIn ? [Contributions.Player({ seat, value })] : []
    );

    const usesBeacon = beacon.used || playerContributions.length === 0;

    const contributions = [
      ...(usesBeacon
        ? [
            Contributions.Beacon({
              randomness: beacon.randomness,
              round: beacon.round,
            }),
          ]
        : []),
      ...playerContributions,
    ];

    const sealed = sealHand(
      context,
      decks,
      secret,
      usesBeacon ? Option.some(beacon.round) : Option.none()
    );

    return dealHonestly(sealed, contributions, dealtIn);
  })
);

export const pickedFrom = (
  hand: HonestHand,
  keep: readonly boolean[]
): readonly Sighting[] => hand.dealt.filter((_, index) => keep[index] === true);

export const keepFlags = Arbitrary.array(Arbitrary.schema(Schema.Boolean), {
  maxLength: DECK_SIZE,
  minLength: DECK_SIZE,
});

export const contextFor = (hand: HonestHand): HandContext =>
  hand.sealed.context;
