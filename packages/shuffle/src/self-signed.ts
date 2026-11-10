import { bls12_381 } from "@noble/curves/bls12-381.js";
import * as Hex from "effect/encoding/Hex";

import { beaconMessage } from "./beacon.js";
import { utf8 } from "./bytes.js";
import { QUICKNET, SIGNATURE_DST } from "./drand.js";
import type { DrandChain } from "./drand.js";
import type { BeaconRound } from "./schemas.js";
import { sha256 } from "./sha256.js";

const signatures = bls12_381.shortSignatures;

export interface SigningChain {
  readonly chain: DrandChain;
  readonly sign: (round: BeaconRound) => Uint8Array;
}

export const selfSignedChain = (label: string): SigningChain => {
  const seed = Uint8Array.from([
    ...sha256(utf8(`${label} key`)),
    ...sha256(utf8(`${label} key, more`)),
  ]).slice(0, signatures.lengths.seed);

  const { publicKey, secretKey } = signatures.keygen(seed);

  return {
    chain: {
      ...QUICKNET,
      beaconId: label,
      chainHash: Hex.encode(sha256(utf8(label))),
      publicKey: Hex.encode(publicKey.toBytes()),
    },
    sign: (round) =>
      signatures
        .sign(signatures.hash(beaconMessage(round), SIGNATURE_DST), secretKey)
        .toBytes(),
  };
};
