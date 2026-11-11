import { describe, expect, it } from "@effect/vitest";
import {
  beaconWaitLimitMs,
  roundTime,
  selfSignedChain,
} from "@nostakes/shuffle";
import { Duration, Effect, Fiber, Layer, Option } from "effect";
import * as Hex from "effect/encoding/Hex";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { TestClock } from "effect/testing";

import { BeaconGaveUp } from "../src/beacon-gave-up.js";
import {
  askBeacon,
  Beacon,
  RELAY_RETRY_MS,
  relayBeacon,
} from "../src/beacon.js";
import { TEST_CHAIN, signedRound } from "./fixtures/test-beacon.js";

const CHAIN = { ...TEST_CHAIN, genesisSeconds: 0 };

const ROUND = 5;

const DUE = roundTime(CHAIN, ROUND);

type Answer = "missing" | "lie" | "real";

const served = (round: number, signature: Uint8Array) =>
  Response.json({ round, signature: Hex.encode(signature) });

const relays = (answer: (relay: string, at: number) => Answer) => {
  const asked: string[] = [];
  const liar = selfSignedChain("a relay that lies");

  const client = HttpClient.make((request, url) =>
    Effect.map(
      Effect.clockWith((clock) => clock.currentTimeMillis),
      (at) => {
        const relay = url.origin;

        asked.push(relay);

        const reply = answer(relay, at);

        if (reply === "missing") {
          return HttpClientResponse.fromWeb(
            request,
            new Response("not yet", { status: 404 })
          );
        }

        return HttpClientResponse.fromWeb(
          request,
          served(
            ROUND,
            reply === "real" ? signedRound(ROUND) : liar.sign(ROUND)
          )
        );
      }
    )
  );

  const layer = relayBeacon(CHAIN, [
    "https://one.test",
    "https://two.test",
    "https://three.test",
  ]).pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client)));

  return { asked, layer };
};

const fetchRound = Beacon.use((beacon) => beacon.signature(ROUND));

describe("the relay beacon", () => {
  it.effect(
    "takes the round from the first relay whose signature checks, past one that is down and one that lies",
    () =>
      Effect.gen(function* pickRelay() {
        const { asked, layer } = relays((relay) => {
          if (relay === "https://one.test") {
            return "missing";
          }

          return relay === "https://two.test" ? "lie" : "real";
        });

        yield* TestClock.setTime(DUE);

        const signature = yield* fetchRound.pipe(Effect.provide(layer));

        expect(signature).toEqual(Option.some(signedRound(ROUND)));
        expect(asked).toEqual([
          "https://one.test",
          "https://two.test",
          "https://three.test",
        ]);
      })
  );

  it.effect("asks again until a relay has the round", () =>
    Effect.gen(function* waitForRound() {
      const appears = DUE + 1200;

      const { asked, layer } = relays((_, at) =>
        at >= appears ? "real" : "missing"
      );

      yield* TestClock.setTime(DUE);

      const fiber = yield* fetchRound.pipe(
        Effect.provide(layer),
        Effect.forkChild
      );

      yield* TestClock.adjust(Duration.millis(3 * RELAY_RETRY_MS));

      expect(yield* Fiber.join(fiber)).toEqual(Option.some(signedRound(ROUND)));
      expect(new Set(asked).size).toBe(3);
    })
  );

  it.effect(
    "gives up once the wait limit has passed since the round was due, having asked every relay",
    () =>
      Effect.gen(function* giveUp() {
        const { asked, layer } = relays(() => "missing");

        yield* TestClock.setTime(DUE);

        const fiber = yield* fetchRound.pipe(
          Effect.provide(layer),
          Effect.forkChild
        );

        yield* TestClock.adjust(Duration.millis(beaconWaitLimitMs(CHAIN) - 1));

        expect(fiber.pollUnsafe()).toBeUndefined();

        yield* TestClock.adjust(Duration.millis(1));

        expect(yield* Fiber.join(fiber)).toEqual(Option.none());
        expect(asked.length).toBeGreaterThanOrEqual(
          3 * (beaconWaitLimitMs(CHAIN) / RELAY_RETRY_MS)
        );
      })
  );
});

const WAIT = beaconWaitLimitMs(CHAIN);

const askedBy = (relaysLayer: Layer.Layer<Beacon>) =>
  Beacon.use((beacon) => askBeacon(beacon, ROUND)).pipe(
    Effect.provide(relaysLayer)
  );

describe("asking the beacon for a sealed deal", () => {
  it.effect(
    "gives up once, at the full wait after the round was due, and says how long the relays were asked",
    () =>
      Effect.gen(function* giveUpOnce() {
        const { layer } = relays(() => "missing");

        yield* TestClock.setTime(DUE + 2000);

        const fiber = yield* askedBy(layer).pipe(Effect.forkChild);

        yield* TestClock.adjust(Duration.millis(WAIT - 2000 - 1));

        expect(fiber.pollUnsafe()).toBeUndefined();

        yield* TestClock.adjust(Duration.millis(1));

        const answer = yield* Fiber.join(fiber);

        expect(answer).toStrictEqual({
          gaveUp: Option.some(
            new BeaconGaveUp({
              pastDueMs: WAIT,
              round: ROUND,
              triedMs: WAIT - 2000,
            })
          ),
          signature: Option.none(),
        });
        expect(Option.getOrThrow(answer.gaveUp).message).toBe(
          `The room could not get drand round ${ROUND}: it asked the relays for ${WAIT - 2000} ms and gave up ${WAIT} ms after the round was due, so it shuffled the hand itself and every player sees that hand as not checked. Check that the Worker can reach the drand relays.`
        );
      })
  );

  it.effect(
    "never says the beacon was unavailable before the full wait, even when the relays give up at once",
    () =>
      Effect.gen(function* waitTheFullTime() {
        const quitter = Layer.succeed(Beacon, {
          chain: CHAIN,
          signature: () => Effect.succeed(Option.none<Uint8Array>()),
        });

        yield* TestClock.setTime(DUE);

        const fiber = yield* askedBy(quitter).pipe(Effect.forkChild);

        yield* TestClock.adjust(Duration.millis(WAIT - 1));

        expect(fiber.pollUnsafe()).toBeUndefined();

        yield* TestClock.adjust(Duration.millis(1));

        expect(
          (yield* Fiber.join(fiber)).gaveUp.pipe(
            Option.map(({ pastDueMs, triedMs }) => ({ pastDueMs, triedMs }))
          )
        ).toStrictEqual(Option.some({ pastDueMs: WAIT, triedMs: 0 }));
      })
  );

  it.effect("passes a round on with no give-up when a relay has it", () =>
    Effect.gen(function* takeTheRound() {
      const { layer } = relays(() => "real");

      yield* TestClock.setTime(DUE);

      expect(yield* askedBy(layer)).toStrictEqual({
        gaveUp: Option.none(),
        signature: Option.some(signedRound(ROUND)),
      });
    })
  );
});
