import { Data, Result } from "effect";

import { verifyBeacon } from "./beacon.js";
import type { DrandChain } from "./drand.js";
import type { HandRejected } from "./rejection.js";
import { SealArrivedAfterRound } from "./rejections/seal-arrived-after-round.js";
import type {
  BeaconRound,
  DeckOpening,
  DeckSlot,
  HandContext,
  Seal,
  Seats,
  Seed,
  Sighting,
} from "./schemas.js";
import { PHONE_CLOCK_TOLERANCE_MS, sealTiming, SealTimings } from "./timing.js";
import type { SealArrival, SealTiming } from "./timing.js";
import { verifyHand } from "./verify.js";

export type Deal = Data.TaggedEnum<{
  FromBeacon: {
    readonly round: BeaconRound;
    readonly signature: Uint8Array;
    readonly seats: Seats;
    readonly spare: DeckOpening;
    readonly sightings: readonly Sighting[];
  };
  BeaconUnavailable: { readonly round: BeaconRound };
}>;

export const Deals = Data.taggedEnum<Deal>();

export interface HandEvidence {
  readonly chain: DrandChain;
  readonly context: HandContext;
  readonly seal: Seal;
  readonly sealArrival: SealArrival;
  readonly deal: Deal;
}

export type CheckedTiming = Data.TaggedEnum.Value<
  SealTiming,
  "InTime" | "TooCloseToCall" | "NotWatched"
>;

export type Verdict = Data.TaggedEnum<{
  Checked: {
    readonly round: BeaconRound;
    readonly seed: Seed;
    readonly dealtSlot: DeckSlot;
    readonly cardsChecked: number;
    readonly timing: CheckedTiming;
  };
  NotChecked: {
    readonly round: BeaconRound;
    readonly reason: "beacon unavailable";
  };
  Failed: { readonly reason: HandRejected };
}>;

export const Verdicts = Data.taggedEnum<Verdict>();

const timingThatHeld = (
  timing: SealTiming
): Result.Result<CheckedTiming, SealArrivedAfterRound> =>
  SealTimings.$match(timing, {
    ArrivedAfterRound: ({ arrivedAt, round, roundAt }) =>
      Result.fail(
        new SealArrivedAfterRound({
          arrivedAt,
          round,
          roundAt,
          tolerance: PHONE_CLOCK_TOLERANCE_MS,
        })
      ),
    InTime: (held) => Result.succeed(held),
    NotWatched: (held) => Result.succeed(held),
    TooCloseToCall: (held) => Result.succeed(held),
  });

const judgeBeaconDeal = (
  evidence: HandEvidence,
  deal: Data.TaggedEnum.Value<Deal, "FromBeacon">
): Result.Result<Verdict, HandRejected> =>
  Result.gen(function* judgeOneBeaconDeal() {
    const beacon = yield* verifyBeacon(
      evidence.chain,
      deal.round,
      deal.signature
    );

    const timing = yield* timingThatHeld(
      sealTiming(
        evidence.chain,
        evidence.seal.beaconRound,
        evidence.sealArrival
      )
    );

    const verified = yield* verifyHand({
      beacon,
      context: evidence.context,
      seal: evidence.seal,
      seats: deal.seats,
      sightings: deal.sightings,
      spare: deal.spare,
    });

    return Verdicts.Checked({
      cardsChecked: verified.checked,
      dealtSlot: verified.dealtSlot,
      round: beacon.round,
      seed: verified.seed,
      timing,
    });
  });

export const judgeHand = (evidence: HandEvidence): Verdict =>
  Deals.$match(evidence.deal, {
    BeaconUnavailable: () =>
      Verdicts.NotChecked({
        reason: "beacon unavailable",
        round: evidence.seal.beaconRound,
      }),
    FromBeacon: (deal) =>
      Result.match(judgeBeaconDeal(evidence, deal), {
        onFailure: (reason) => Verdicts.Failed({ reason }),
        onSuccess: (checked) => checked,
      }),
  });
