import { roundTime, selfSignedChain } from "@nostakes/shuffle";
import type { BeaconRound } from "@nostakes/shuffle";
import { Clock, Duration, Effect, Layer, Option } from "effect";

import { Beacon } from "../../src/beacon.js";

const signer = selfSignedChain("nostakes room-server test beacon");

export const TEST_CHAIN = { ...signer.chain, periodSeconds: 1 };

export const OUTAGE_EVERY = 29;

export const beaconDown = (round: BeaconRound) => round % OUTAGE_EVERY === 0;

export const signedRound = (round: BeaconRound) => signer.sign(round);

export const relayAnswer = (
  round: BeaconRound,
  now: number
): Option.Option<Uint8Array> =>
  now >= roundTime(TEST_CHAIN, round) && !beaconDown(round)
    ? Option.some(signedRound(round))
    : Option.none();

export const testBeacon = Layer.succeed(Beacon, {
  chain: TEST_CHAIN,
  signature: (round: BeaconRound) =>
    Effect.gen(function* awaitTestRound() {
      const now = yield* Clock.currentTimeMillis;
      const due = roundTime(TEST_CHAIN, round);

      if (now < due) {
        yield* Effect.sleep(Duration.millis(due - now));
      }

      return relayAnswer(round, Math.max(now, due));
    }),
});
