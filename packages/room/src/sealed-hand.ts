import type { SeatIndex } from "@nostakes/engine";
import {
  EpochMillisSchema,
  RandomnessSchema,
  SEALING_MARGIN_MS,
  dealingPlan,
  roundTime,
  roundToSeal,
  sealHand,
  seedOf,
  sha256,
} from "@nostakes/shuffle";
import type {
  Beacon,
  BeaconRound,
  DealingPlan,
  DrandChain,
  SealedHand,
} from "@nostakes/shuffle";
import { Option } from "effect";

import { RoomEvents } from "./events.js";
import type { RoomEvent, WithdrawalReason } from "./events.js";
import type { RoomCode } from "./identity.js";
import type { Open, Sealed } from "./state.js";
import { MILLIS_PER_SECOND, millis } from "./time.js";
import type { Millis } from "./time.js";

export const roundAt = (chain: DrandChain, round: BeaconRound): Millis =>
  millis(roundTime(chain, round));

export const sealLeadMs = (chain: DrandChain) =>
  SEALING_MARGIN_MS + (chain.periodSeconds * MILLIS_PER_SECOND) / 2;

export const contextOf = (code: RoomCode, hand: number) => ({
  hand,
  room: code,
});

export const sealedHandOf = (code: RoomCode, sealed: Sealed): SealedHand =>
  sealHand(
    contextOf(code, sealed.hand),
    sealed.decks,
    sealed.secret,
    sealed.round,
    sealed.seats
  );

export const sealOf = (sealed: Sealed) => ({
  beaconRound: sealed.round,
  roots: sealed.roots,
  seats: sealed.seats,
});

export const planOf = (
  code: RoomCode,
  sealed: Sealed,
  beacon: Beacon
): DealingPlan =>
  dealingPlan(seedOf(contextOf(code, sealed.hand), sealOf(sealed), beacon));

export const beaconOf = (
  round: BeaconRound,
  signature: Uint8Array
): Beacon => ({
  randomness: RandomnessSchema.make(sha256(signature)),
  round,
});

export const dealtDeck = (
  sealed: Sealed,
  plan: DealingPlan
): readonly number[] =>
  plan.order.flatMap((position) => {
    const card = sealed.decks[plan.dealtSlot][position];

    return card === undefined ? [] : [card];
  });

export const epochOf = (at: Millis) => EpochMillisSchema.make(at);

export const stillWithdrawable = (state: Open, sealed: Sealed, at: Millis) =>
  roundToSeal(state.chain, epochOf(at)) <= sealed.round;

export const sealIsBinding = (state: Open, at: Millis) =>
  Option.exists(
    state.sealed,
    (sealed) => !stillWithdrawable(state, sealed, at)
  );

export const sealBinds = (state: Open, seat: SeatIndex, at: Millis) =>
  Option.exists(
    state.sealed,
    (sealed) =>
      sealed.seats.includes(seat) && !stillWithdrawable(state, sealed, at)
  );

export const withdrawal = (
  sealed: Sealed,
  reason: WithdrawalReason,
  at: Millis
): RoomEvent =>
  RoomEvents.SealWithdrawn({
    at,
    hand: sealed.hand,
    reason,
    round: sealed.round,
  });
