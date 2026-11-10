import { bls12_381 } from "@noble/curves/bls12-381.js";
import { Result } from "effect";

import { SIGNATURE_DST } from "./drand.js";
import type { DrandChain } from "./drand.js";
import { BeaconSignatureInvalid } from "./rejections/beacon-signature-invalid.js";
import { BeaconSignatureMalformed } from "./rejections/beacon-signature-malformed.js";
import { RandomnessSchema } from "./schemas.js";
import type { BeaconRound, Randomness } from "./schemas.js";
import { sha256 } from "./sha256.js";

export interface Beacon {
  readonly round: BeaconRound;
  readonly randomness: Randomness;
}

const ROUND_BYTES = 8;

const signatures = bls12_381.shortSignatures;

export const beaconMessage = (round: BeaconRound): Uint8Array => {
  const bytes = new Uint8Array(ROUND_BYTES);

  new DataView(bytes.buffer).setBigUint64(0, BigInt(round));

  return sha256(bytes);
};

export const verifyBeacon = (
  chain: DrandChain,
  round: BeaconRound,
  signature: Uint8Array
): Result.Result<Beacon, BeaconSignatureMalformed | BeaconSignatureInvalid> =>
  Result.try({
    catch: () =>
      new BeaconSignatureMalformed({
        beaconId: chain.beaconId,
        bytes: signature.length,
        round,
      }),
    try: () => signatures.Signature.fromBytes(signature),
  }).pipe(
    Result.flatMap((point) =>
      signatures.verify(
        point,
        signatures.hash(beaconMessage(round), SIGNATURE_DST),
        bls12_381.G2.Point.fromHex(chain.publicKey)
      )
        ? Result.succeed({
            randomness: RandomnessSchema.make(sha256(signature)),
            round,
          })
        : Result.fail(
            new BeaconSignatureInvalid({ beaconId: chain.beaconId, round })
          )
    )
  );
