import { describe, expect, it } from "@effect/vitest";
import {
  BEACON_WAIT_LIMIT_MS,
  roundTime,
  selfSignedChain,
} from "@nostakes/shuffle";
import { Duration, Effect, Fiber, Layer, Option } from "effect";
import * as Hex from "effect/encoding/Hex";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { TestClock } from "effect/testing";

import { Beacon, RELAY_RETRY_MS, relayBeacon } from "../src/beacon.js";
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

        yield* TestClock.adjust(Duration.millis(BEACON_WAIT_LIMIT_MS - 1));

        expect(fiber.pollUnsafe()).toBeUndefined();

        yield* TestClock.adjust(Duration.millis(1));

        expect(yield* Fiber.join(fiber)).toEqual(Option.none());
        expect(asked.length).toBeGreaterThan(3 * 10);
      })
  );
});
