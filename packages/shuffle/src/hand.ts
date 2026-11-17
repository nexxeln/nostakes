import { Option } from "effect";

import { openCard, openDeck, sealDeck } from "./commitment.js";
import type { SealedDeck } from "./commitment.js";
import type { DealingPlan } from "./order.js";
import { TWO_HOLE_CARDS } from "./schemas.js";
import type {
  BeaconRound,
  DealIndex,
  Deck,
  DeckOpening,
  HandContext,
  HoleCards,
  Opening,
  SaltSecret,
  Seal,
  Seats,
} from "./schemas.js";

export interface SealedHand {
  readonly context: HandContext;
  readonly decks: readonly [SealedDeck, SealedDeck];
  readonly seal: Seal;
}

export const sealHand = (
  context: HandContext,
  decks: readonly [Deck, Deck],
  secret: SaltSecret,
  beaconRound: BeaconRound,
  seats: Seats,
  holeCards: HoleCards = TWO_HOLE_CARDS
): SealedHand => {
  const sealed = [
    sealDeck(context, 0, decks[0], secret),
    sealDeck(context, 1, decks[1], secret),
  ] as const;

  const seal: Seal = {
    beaconRound,
    roots: [sealed[0].root, sealed[1].root],
    seats,
  };

  return {
    context,
    decks: sealed,
    seal:
      holeCards === TWO_HOLE_CARDS
        ? seal
        : { ...seal, holeCardCount: holeCards },
  };
};

export const openDealt = (
  hand: SealedHand,
  plan: DealingPlan,
  dealIndex: DealIndex
): Option.Option<Opening> =>
  Option.fromNullishOr(plan.order[dealIndex]).pipe(
    Option.flatMap((position) => openCard(hand.decks[plan.dealtSlot], position))
  );

export const openSpare = (hand: SealedHand, plan: DealingPlan): DeckOpening =>
  openDeck(hand.decks[plan.spareSlot]);
