import { describe, expect, it } from "@effect/vitest";
import { Result } from "effect";
import * as Hex from "effect/encoding/Hex";

import {
  EpochMillisSchema,
  firstFutureRound,
  QUICKNET,
  roundTime,
  sha256,
} from "../src/index.js";
import type { DrandChain } from "../src/index.js";
import { between } from "./arbitraries.js";
import {
  LATEST_QUICKNET_ROUNDS_SEEN,
  QUICKNET_TESTNET,
} from "./fixtures/drand-rounds.js";

const bytesOf = (hex: string) => Result.getOrThrow(Hex.decode(hex));

const drandChainHash = (chain: DrandChain) => {
  const period = new Uint8Array(4);
  const genesis = new Uint8Array(8);

  new DataView(period.buffer).setUint32(0, chain.periodSeconds);
  new DataView(genesis.buffer).setBigInt64(0, BigInt(chain.genesisSeconds));

  return Hex.encode(
    sha256(
      Uint8Array.from([
        ...period,
        ...genesis,
        ...bytesOf(chain.publicKey),
        ...bytesOf(chain.genesisSeed),
        ...new TextEncoder().encode(chain.beaconId),
      ])
    )
  );
};

const at = (millis: number) => EpochMillisSchema.make(millis);

describe("the drand chain as data", () => {
  it.each([
    ["quicknet", QUICKNET],
    ["quicknet-t", QUICKNET_TESTNET],
  ])(
    "%s's period, genesis, public key, seed, and id hash to its published chain hash",
    (_, chain) => {
      expect(drandChainHash(chain)).toBe(chain.chainHash);
    }
  );

  it("puts round 1 at quicknet's genesis and a round every three seconds after", () => {
    expect([
      roundTime(QUICKNET, 1),
      roundTime(QUICKNET, 2),
      roundTime(QUICKNET, 1_000_001),
    ]).toEqual([1_692_803_367_000, 1_692_803_370_000, 1_695_803_367_000]);
  });

  it.each(LATEST_QUICKNET_ROUNDS_SEEN)(
    "agrees with the latest quicknet round a relay served: round $round",
    ({ requestSentAt, responseReceivedAt, round }) => {
      expect(roundTime(QUICKNET, round)).toBeLessThanOrEqual(
        responseReceivedAt
      );
      expect(roundTime(QUICKNET, round + 2)).toBeGreaterThan(requestSentAt);
      expect(firstFutureRound(QUICKNET, at(responseReceivedAt))).toBe(
        round + 1
      );
    }
  );
});

describe("round times and the first future round", () => {
  it.prop(
    "a round is in the future until its time and in the past from then on",
    { round: between(1, 1_000_000_000) },
    ({ round }) => {
      const time = roundTime(QUICKNET, round);

      expect([
        firstFutureRound(QUICKNET, at(time - 1)),
        firstFutureRound(QUICKNET, at(time)),
      ]).toEqual([round, round + 1]);
    }
  );

  it.prop(
    "the first future round is due after the given time and the round before it is not",
    { time: between(0, 2 ** 42) },
    ({ time }) => {
      const next = firstFutureRound(QUICKNET, at(time));

      expect(roundTime(QUICKNET, next)).toBeGreaterThan(time);
      expect(next === 1 || roundTime(QUICKNET, next - 1) <= time).toBe(true);
    }
  );
});
