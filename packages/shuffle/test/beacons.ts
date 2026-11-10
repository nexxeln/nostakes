import { bls12_381 } from "@noble/curves/bls12-381.js";
import * as Hex from "effect/encoding/Hex";

import {
  beaconMessage,
  QUICKNET,
  SIGNATURE_DST,
  sha256,
} from "../src/index.js";
import type { BeaconRound, DrandChain } from "../src/index.js";

const signatures = bls12_381.shortSignatures;

const text = (value: string) => new TextEncoder().encode(value);

export interface SigningChain {
  readonly chain: DrandChain;
  readonly sign: (round: BeaconRound) => Uint8Array;
}

export const signingChain = (label: string): SigningChain => {
  const seed = Uint8Array.from([
    ...sha256(text(`${label} key`)),
    ...sha256(text(`${label} key, more`)),
  ]).slice(0, signatures.lengths.seed);

  const { publicKey, secretKey } = signatures.keygen(seed);

  return {
    chain: {
      ...QUICKNET,
      beaconId: label,
      chainHash: Hex.encode(sha256(text(label))),
      publicKey: Hex.encode(publicKey.toBytes()),
    },
    sign: (round) =>
      signatures
        .sign(signatures.hash(beaconMessage(round), SIGNATURE_DST), secretKey)
        .toBytes(),
  };
};
