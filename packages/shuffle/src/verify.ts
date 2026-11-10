import { Array as Arr, Option, Result } from "effect";

import { sameBytes } from "./bytes.js";
import { deckRoot, verifyOpening } from "./commitment.js";
import { dealingPlan } from "./order.js";
import type { DealingPlan } from "./order.js";
import {
  BeaconRoundMismatch,
  CardSeenTwice,
  DealtSeatsDiffer,
  RoleOutOfRange,
  ShownCardDiffers,
  SpareDeckMismatch,
  SpareDeckRepeatsCard,
  WrongPosition,
} from "./rejection.js";
import type { HandRejected } from "./rejection.js";
import { DealIndexSchema, DECK_SIZE, Roles } from "./schemas.js";
import type {
  Card,
  DealIndex,
  DeckSlot,
  PlayerSaw,
  Role,
  Seed,
  Sighting,
} from "./schemas.js";
import { seedOf } from "./seed.js";

export interface Verified {
  readonly seed: Seed;
  readonly dealtSlot: DeckSlot;
  readonly checked: number;
}

interface Seen {
  readonly dealIndex: DealIndex;
  readonly card: Card;
}

export const dealIndexOf = (
  role: Role,
  dealtIn: number
): Option.Option<DealIndex> =>
  Roles.$match(role, {
    Community: ({ drawn }) => Option.some(2 * dealtIn + drawn),
    Hole: ({ pass, turn }) =>
      turn < dealtIn ? Option.some(pass * dealtIn + turn) : Option.none(),
  }).pipe(
    Option.filter((index) => index < DECK_SIZE),
    Option.map((index) => DealIndexSchema.make(index))
  );

const checkRound = (saw: PlayerSaw) =>
  saw.beacon.round === saw.seal.beaconRound
    ? Result.void
    : Result.fail(
        new BeaconRoundMismatch({
          sealed: saw.seal.beaconRound,
          used: saw.beacon.round,
        })
      );

const checkSeats = (saw: PlayerSaw) =>
  saw.seats.length === saw.seal.seats.length &&
  saw.seats.every((seat, turn) => seat === saw.seal.seats[turn])
    ? Result.void
    : Result.fail(
        new DealtSeatsDiffer({ dealt: saw.seats, sealed: saw.seal.seats })
      );

const checkSpare = (saw: PlayerSaw, plan: DealingPlan) => {
  const repeated = saw.spare.cards.find(
    (card, index) => saw.spare.cards.indexOf(card) !== index
  );

  if (repeated !== undefined) {
    return Result.fail(
      new SpareDeckRepeatsCard({ card: repeated, slot: plan.spareSlot })
    );
  }

  return sameBytes(
    deckRoot(saw.context, plan.spareSlot, saw.spare),
    saw.seal.roots[plan.spareSlot]
  )
    ? Result.void
    : Result.fail(new SpareDeckMismatch({ slot: plan.spareSlot }));
};

const checkSighting = (
  saw: PlayerSaw,
  plan: DealingPlan,
  sighting: Sighting
): Result.Result<Seen, HandRejected> =>
  Result.gen(function* checkOneSighting() {
    const dealtIn = saw.seal.seats.length;
    const outOfRange = new RoleOutOfRange({ dealtIn, role: sighting.role });

    const dealIndex = yield* Result.fromOption(
      dealIndexOf(sighting.role, dealtIn),
      () => outOfRange
    );

    const expected = yield* Result.fromOption(
      Arr.get(plan.order, dealIndex),
      () => outOfRange
    );

    const { opening } = sighting;

    if (opening.position !== expected) {
      return yield* Result.fail(
        new WrongPosition({ dealIndex, expected, opened: opening.position })
      );
    }

    yield* verifyOpening(
      saw.context,
      plan.dealtSlot,
      saw.seal.roots[plan.dealtSlot],
      opening
    );

    if (sighting.shown !== opening.card) {
      return yield* Result.fail(
        new ShownCardDiffers({
          dealIndex,
          opened: opening.card,
          shown: sighting.shown,
        })
      );
    }

    return { card: opening.card, dealIndex };
  });

const checkNoCardTwice = (seen: readonly Seen[]) => {
  for (const [index, sighting] of seen.entries()) {
    const twin = seen
      .slice(0, index)
      .find(
        (other) =>
          other.card === sighting.card && other.dealIndex !== sighting.dealIndex
      );

    if (twin !== undefined) {
      return Result.fail(
        new CardSeenTwice({
          card: sighting.card,
          first: twin.dealIndex,
          second: sighting.dealIndex,
        })
      );
    }
  }

  return Result.void;
};

export const verifyHand = (
  saw: PlayerSaw
): Result.Result<Verified, HandRejected> =>
  Result.gen(function* verifyOneHand() {
    yield* checkRound(saw);
    yield* checkSeats(saw);

    const seed = seedOf(saw.context, saw.seal, saw.beacon);
    const plan = dealingPlan(seed);

    yield* checkSpare(saw, plan);

    const seen: Seen[] = [];

    for (const sighting of saw.sightings) {
      seen.push(yield* checkSighting(saw, plan, sighting));
    }

    yield* checkNoCardTwice(seen);

    return { checked: seen.length, dealtSlot: plan.dealtSlot, seed };
  });
