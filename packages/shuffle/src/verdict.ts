import { Data, Option, Result } from "effect";

import { verifyBeacon } from "./beacon.js";
import { roundTime } from "./drand.js";
import type { DrandChain } from "./drand.js";
import type { HandRejected } from "./rejection.js";
import { OutageClaimedEarly } from "./rejections/outage-claimed-early.js";
import { SealArrivedAfterRound } from "./rejections/seal-arrived-after-round.js";
import type {
  BeaconRound,
  DeckOpening,
  DeckSlot,
  EpochMillis,
  HandContext,
  Seal,
  Seats,
  Seed,
  Sighting,
} from "./schemas.js";
import {
  beaconGiveUpTime,
  OUTAGE_ARRIVAL_ALLOWANCE_MS,
  PHONE_CLOCK_TOLERANCE_MS,
  SealArrivals,
  sealTiming,
  SealTimings,
} from "./timing.js";
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
  BeaconUnavailable: {
    readonly round: BeaconRound;
    readonly dealtAt: Option.Option<EpochMillis>;
    readonly arrival: SealArrival;
  };
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

const outageClaimHeld = (
  chain: DrandChain,
  round: BeaconRound,
  deal: Data.TaggedEnum.Value<Deal, "BeaconUnavailable">
): Result.Result<BeaconRound, OutageClaimedEarly> => {
  const roundAt = roundTime(chain, round);
  const giveUpAt = beaconGiveUpTime(chain, round);

  const early = (
    seenAt: number,
    seenBy: OutageClaimedEarly["seenBy"],
    allowance: number
  ) =>
    Result.fail(
      new OutageClaimedEarly({
        allowance,
        giveUpAt,
        round,
        roundAt,
        seenAt,
        seenBy,
      })
    );

  const stampedEarly = deal.dealtAt.pipe(Option.filter((at) => at < giveUpAt));

  if (Option.isSome(stampedEarly)) {
    return early(stampedEarly.value, "the server's record", 0);
  }

  return SealArrivals.$is("Live")(deal.arrival) &&
    deal.arrival.at + OUTAGE_ARRIVAL_ALLOWANCE_MS < giveUpAt
    ? early(deal.arrival.at, "this device", OUTAGE_ARRIVAL_ALLOWANCE_MS)
    : Result.succeed(round);
};

export const judgeHand = (evidence: HandEvidence): Verdict =>
  Deals.$match(evidence.deal, {
    BeaconUnavailable: (deal) =>
      Result.match(
        outageClaimHeld(evidence.chain, evidence.seal.beaconRound, deal),
        {
          onFailure: (reason) => Verdicts.Failed({ reason }),
          onSuccess: (round) =>
            Verdicts.NotChecked({ reason: "beacon unavailable", round }),
        }
      ),
    FromBeacon: (deal) =>
      Result.match(judgeBeaconDeal(evidence, deal), {
        onFailure: (reason) => Verdicts.Failed({ reason }),
        onSuccess: (checked) => checked,
      }),
  });
