import { Data, Option } from "effect";

import { firstFutureRound, roundTime } from "./drand.js";
import type { DrandChain } from "./drand.js";
import { SealWithNoDeal } from "./rejections/seal-with-no-deal.js";
import type { Withdrawal } from "./rejections/seal-with-no-deal.js";
import { EpochMillisSchema } from "./schemas.js";
import type { BeaconRound, EpochMillis } from "./schemas.js";

export const PHONE_CLOCK_TOLERANCE_MS = 1000;

export const BEACON_EARLY_MS = 500;

export const SERVER_CLOCK_BUDGET_MS = 500;

export const SEAL_DELIVERY_BUDGET_MS = 500;

export const SEALING_MARGIN_MS =
  2 * PHONE_CLOCK_TOLERANCE_MS +
  BEACON_EARLY_MS +
  SERVER_CLOCK_BUDGET_MS +
  SEAL_DELIVERY_BUDGET_MS;

export const BEACON_WAIT_LIMIT_MS = 15_000;

export const roundToSeal = (
  chain: DrandChain,
  sealedAt: EpochMillis
): BeaconRound =>
  firstFutureRound(
    chain,
    EpochMillisSchema.make(sealedAt + SEALING_MARGIN_MS - 1)
  );

export type SealArrival = Data.TaggedEnum<{
  Live: { readonly at: EpochMillis };
  CaughtUp: { readonly at: EpochMillis };
}>;

export const SealArrivals = Data.taggedEnum<SealArrival>();

interface TimingFacts {
  readonly round: BeaconRound;
  readonly roundAt: EpochMillis;
  readonly arrivedAt: EpochMillis;
}

export type SealTiming = Data.TaggedEnum<{
  InTime: TimingFacts;
  TooCloseToCall: TimingFacts;
  ArrivedAfterRound: TimingFacts;
  NotWatched: TimingFacts;
}>;

export const SealTimings = Data.taggedEnum<SealTiming>();

export const sealTiming = (
  chain: DrandChain,
  round: BeaconRound,
  arrival: SealArrival
): SealTiming => {
  const roundAt = roundTime(chain, round);

  return SealArrivals.$match(arrival, {
    CaughtUp: ({ at }) =>
      SealTimings.NotWatched({ arrivedAt: at, round, roundAt }),
    Live: ({ at }) => {
      const facts = { arrivedAt: at, round, roundAt };

      if (at + PHONE_CLOCK_TOLERANCE_MS + BEACON_EARLY_MS < roundAt) {
        return SealTimings.InTime(facts);
      }

      return at - PHONE_CLOCK_TOLERANCE_MS >= roundAt
        ? SealTimings.ArrivedAfterRound(facts)
        : SealTimings.TooCloseToCall(facts);
    },
  });
};

export interface SealSeen {
  readonly hand: number;
  readonly round: BeaconRound;
  readonly dealt: boolean;
  readonly withdrawn: Option.Option<SealArrival>;
}

const withdrawalOf = (timing: SealTiming): Option.Option<Withdrawal> =>
  SealTimings.$match(timing, {
    ArrivedAfterRound: () => Option.some("after the round" as const),
    InTime: () => Option.none(),
    NotWatched: () => Option.some("while away" as const),
    TooCloseToCall: () => Option.some("too close to the round" as const),
  });

const overdue = (chain: DrandChain, now: EpochMillis, round: BeaconRound) =>
  now - PHONE_CLOCK_TOLERANCE_MS >=
  roundTime(chain, round) + BEACON_WAIT_LIMIT_MS + SEAL_DELIVERY_BUDGET_MS;

const problemWith = (
  chain: DrandChain,
  now: EpochMillis,
  seal: SealSeen
): Option.Option<Withdrawal> => {
  if (seal.dealt) {
    return Option.none();
  }

  return Option.match(seal.withdrawn, {
    onNone: () =>
      overdue(chain, now, seal.round)
        ? Option.some("never" as const)
        : Option.none(),
    onSome: (arrival) => withdrawalOf(sealTiming(chain, seal.round, arrival)),
  });
};

export const sealsWithNoDeal = (
  chain: DrandChain,
  now: EpochMillis,
  seen: readonly SealSeen[]
): readonly SealWithNoDeal[] =>
  seen.flatMap((seal) =>
    Option.match(problemWith(chain, now, seal), {
      onNone: () => [],
      onSome: (withdrawal) => [
        new SealWithNoDeal({ hand: seal.hand, round: seal.round, withdrawal }),
      ],
    })
  );
