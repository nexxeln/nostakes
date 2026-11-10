import { Array as Arr, Option, Result } from "effect";

import { sameBytes } from "./bytes.js";
import { deckRoot, verifyOpening } from "./commitment.js";
import { dealingPlan } from "./order.js";
import type { DealingPlan } from "./order.js";
import {
  CardSeenTwice,
  MyContributionAltered,
  MyContributionLeftOut,
  RoleOutOfRange,
  ShownCardDiffers,
  SpareDeckMismatch,
  SpareDeckRepeatsCard,
  WrongPosition,
} from "./rejection.js";
import type { HandRejected } from "./rejection.js";
import { Contributions, DealIndexSchema, DECK_SIZE, Roles } from "./schemas.js";
import type {
  Card,
  DealIndex,
  DeckSlot,
  PlayerSaw,
  Role,
  Seed,
  Sighting,
} from "./schemas.js";
import { combine } from "./seed.js";

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

const checkMine = (saw: PlayerSaw) =>
  Option.match(saw.mine, {
    onNone: () => Result.void,
    onSome: (mine) => {
      const listed = saw.contributions
        .filter(Contributions.$is("Player"))
        .find(({ seat }) => seat === mine.seat);

      if (listed === undefined) {
        return Result.fail(new MyContributionLeftOut({ seat: mine.seat }));
      }

      return sameBytes(listed.value, mine.value)
        ? Result.void
        : Result.fail(new MyContributionAltered({ seat: mine.seat }));
    },
  });

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
    const outOfRange = new RoleOutOfRange({
      dealtIn: saw.dealtIn,
      role: sighting.role,
    });

    const dealIndex = yield* Result.fromOption(
      dealIndexOf(sighting.role, saw.dealtIn),
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
    const seed = yield* combine(saw.context, saw.seal, saw.contributions);

    yield* checkMine(saw);

    const plan = dealingPlan(seed);

    yield* checkSpare(saw, plan);

    const seen: Seen[] = [];

    for (const sighting of saw.sightings) {
      seen.push(yield* checkSighting(saw, plan, sighting));
    }

    yield* checkNoCardTwice(seen);

    return { checked: seen.length, dealtSlot: plan.dealtSlot, seed };
  });
