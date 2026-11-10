import { describe, expect, it } from "@effect/vitest";
import { Result, Schema } from "effect";
import * as Hex from "effect/encoding/Hex";

import {
  beaconMessage,
  BeaconSignatureInvalid,
  BeaconSignatureMalformed,
  QUICKNET,
  verifyBeacon,
} from "../src/index.js";
import type { DrandChain } from "../src/index.js";
import { between } from "./arbitraries.js";
import {
  DEFAULT_CHAIN_ROUND,
  QUICKNET_ROUNDS,
  QUICKNET_TESTNET,
  QUICKNET_TESTNET_ROUNDS,
} from "./fixtures/drand-rounds.js";
import type { PublishedRound } from "./fixtures/drand-rounds.js";

const bytesOf = (hex: string) => Result.getOrThrow(Hex.decode(hex));

const outcome = (chain: DrandChain, round: number, signature: Uint8Array) =>
  Result.match(verifyBeacon(chain, round, signature), {
    onFailure: (rejected) => rejected,
    onSuccess: ({ randomness, round: verified }) => ({
      randomness: Hex.encode(randomness),
      round: verified,
    }),
  });

const published = (rounds: readonly PublishedRound[], index: number) =>
  rounds[index % rounds.length] ?? DEFAULT_CHAIN_ROUND;

describe("verifyBeacon on real drand rounds", () => {
  it.each(QUICKNET_ROUNDS)(
    "returns the published randomness of quicknet round $round",
    ({ randomness, round, signature }) => {
      expect(outcome(QUICKNET, round, bytesOf(signature))).toEqual({
        randomness,
        round,
      });
    }
  );

  it.each(QUICKNET_TESTNET_ROUNDS)(
    "returns the published randomness of quicknet-t round $round against its own chain",
    ({ randomness, round, signature }) => {
      expect(outcome(QUICKNET_TESTNET, round, bytesOf(signature))).toEqual({
        randomness,
        round,
      });
    }
  );

  it("signs the SHA-256 of the round as eight big-endian bytes", () => {
    expect([
      Hex.encode(beaconMessage(1)),
      Hex.encode(beaconMessage(33_000_000)),
    ]).toEqual([
      "cd2662154e6d76b2b2b92e70c0cac3ccf534f9b74eb5b89819ec509083d00a50",
      "f9fdab351a94cc13c2ce7fc5df555d5fec90dadd20b161fdc5b05fca2ae8f3aa",
    ]);
  });
});

describe("verifyBeacon on a beacon drand did not publish", () => {
  it.each(QUICKNET_ROUNDS)(
    "rejects quicknet round $round's signature offered for a neighbouring round",
    ({ round, signature }) => {
      const neighbours = round === 1 ? [2, 3] : [round - 1, round + 1];

      for (const other of neighbours) {
        expect(outcome(QUICKNET, other, bytesOf(signature))).toEqual(
          new BeaconSignatureInvalid({ beaconId: "quicknet", round: other })
        );
      }
    }
  );

  it.prop(
    "rejects a real signature with any one byte changed",
    {
      by: between(1, 255),
      pick: between(0, QUICKNET_ROUNDS.length - 1),
      spot: between(0, 47),
    },
    ({ by, pick, spot }) => {
      const { round, signature } = published(QUICKNET_ROUNDS, pick);

      const changed = bytesOf(signature).map((byte, index) =>
        index === spot ? (byte + by) % 256 : byte
      );

      const rejected = outcome(QUICKNET, round, changed);

      expect(
        Schema.is(BeaconSignatureInvalid)(rejected) ||
          Schema.is(BeaconSignatureMalformed)(rejected)
      ).toBe(true);
    }
  );

  it.each(QUICKNET_TESTNET_ROUNDS)(
    "rejects the quicknet-t signature of round $round offered as quicknet's, and the other way round",
    ({ round, signature }) => {
      const mainnet = published(
        QUICKNET_ROUNDS,
        QUICKNET_ROUNDS.findIndex((candidate) => candidate.round === round)
      );

      expect([
        outcome(QUICKNET, round, bytesOf(signature)),
        outcome(QUICKNET_TESTNET, round, bytesOf(mainnet.signature)),
      ]).toEqual([
        new BeaconSignatureInvalid({ beaconId: "quicknet", round }),
        new BeaconSignatureInvalid({ beaconId: "quicknet-t", round }),
      ]);
    }
  );

  it("rejects a signature from drand's chained default network as malformed for quicknet", () => {
    const { round, signature } = DEFAULT_CHAIN_ROUND;

    expect(outcome(QUICKNET, round, bytesOf(signature))).toEqual(
      new BeaconSignatureMalformed({ beaconId: "quicknet", bytes: 96, round })
    );
  });
});
