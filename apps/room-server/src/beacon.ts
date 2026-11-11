import {
  beaconGiveUpTime,
  beaconWaitLimitMs,
  roundTime,
  verifyBeacon,
} from "@nostakes/shuffle";
import type { BeaconRound, DrandChain } from "@nostakes/shuffle";
import {
  Clock,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Result,
  Schedule,
  Schema,
} from "effect";
import * as Hex from "effect/encoding/Hex";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { BeaconGaveUp } from "./beacon-gave-up.js";
import { RelayRoundUnusable } from "./relay-round-unusable.js";

export interface BeaconRelays {
  readonly chain: DrandChain;
  readonly signature: (
    round: BeaconRound
  ) => Effect.Effect<Option.Option<Uint8Array>>;
}

export class Beacon extends Context.Service<Beacon, BeaconRelays>()(
  "@nostakes/room-server/Beacon"
) {}

export interface BeaconAnswer {
  readonly signature: Option.Option<Uint8Array>;
  readonly gaveUp: Option.Option<BeaconGaveUp>;
}

export const askBeacon = (
  beacon: BeaconRelays,
  round: BeaconRound
): Effect.Effect<BeaconAnswer> =>
  Effect.gen(function* askForTheRound() {
    const askedAt = yield* Clock.currentTimeMillis;
    const signature = yield* beacon.signature(round);

    if (Option.isSome(signature)) {
      return { gaveUp: Option.none(), signature };
    }

    const answeredAt = yield* Clock.currentTimeMillis;
    const giveUpAt = beaconGiveUpTime(beacon.chain, round);

    if (answeredAt < giveUpAt) {
      yield* Effect.sleep(Duration.millis(giveUpAt - answeredAt));
    }

    const gaveUpAt = yield* Clock.currentTimeMillis;

    return {
      gaveUp: Option.some(
        new BeaconGaveUp({
          pastDueMs: gaveUpAt - roundTime(beacon.chain, round),
          round,
          triedMs: answeredAt - askedAt,
        })
      ),
      signature,
    };
  });

export const DRAND_RELAYS: readonly string[] = [
  "https://api.drand.sh",
  "https://api2.drand.sh",
  "https://drand.cloudflare.com",
  "https://api3.drand.sh",
];

export const RELAY_RETRY_MS = 500;

export const RELAY_TIMEOUT_MS = 2000;

const RelayRoundSchema = Schema.Struct({
  round: Schema.Int,
  signature: Schema.String,
});

const unusable = (relay: string, round: BeaconRound, reason: string) =>
  new RelayRoundUnusable({ reason, relay, round });

const checkedSignature = (
  chain: DrandChain,
  relay: string,
  round: BeaconRound,
  served: typeof RelayRoundSchema.Type
) =>
  Result.flatMap(
    Result.mapError(Hex.decode(served.signature), () =>
      unusable(relay, round, "signature is not hex")
    ),
    (signature) =>
      served.round === round
        ? Result.mapBoth(verifyBeacon(chain, round, signature), {
            onFailure: (failure) => unusable(relay, round, failure._tag),
            onSuccess: () => signature,
          })
        : Result.fail(unusable(relay, round, `served round ${served.round}`))
  );

const fromRelay = (
  client: HttpClient.HttpClient,
  chain: DrandChain,
  relay: string,
  round: BeaconRound
) =>
  client.get(`${relay}/${chain.chainHash}/public/${round}`).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(RelayRoundSchema)),
    Effect.timeout(Duration.millis(RELAY_TIMEOUT_MS)),
    Effect.mapError((failure) => unusable(relay, round, failure.message)),
    Effect.flatMap((served) =>
      Effect.fromResult(checkedSignature(chain, relay, round, served))
    )
  );

export const relayBeacon = (
  chain: DrandChain,
  relays: readonly string[],
  waitLimitMs: number = beaconWaitLimitMs(chain)
) =>
  Layer.effect(
    Beacon,
    Effect.gen(function* makeRelayBeacon() {
      const client = yield* HttpClient.HttpClient;

      const anyRelay = (round: BeaconRound) =>
        Effect.firstSuccessOf(
          relays.map((relay) => fromRelay(client, chain, relay, round))
        );

      return {
        chain,
        signature: (round: BeaconRound) =>
          Effect.gen(function* fetchRound() {
            const now = yield* Clock.currentTimeMillis;
            const giveUpAt = roundTime(chain, round) + waitLimitMs;

            return yield* anyRelay(round).pipe(
              Effect.retry(Schedule.spaced(Duration.millis(RELAY_RETRY_MS))),
              Effect.timeoutOption(
                Duration.millis(Math.max(0, giveUpAt - now))
              ),
              Effect.orElseSucceed(() => Option.none<Uint8Array>())
            );
          }),
      };
    })
  );

export const liveBeacon = (chain: DrandChain) =>
  relayBeacon(chain, DRAND_RELAYS).pipe(Layer.provide(FetchHttpClient.layer));
