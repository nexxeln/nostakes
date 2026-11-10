import { EpochMillisSchema } from "./schemas.js";
import type { BeaconRound, EpochMillis } from "./schemas.js";

export const SIGNATURE_SCHEME = "bls-unchained-g1-rfc9380";

export const SIGNATURE_DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";

export interface DrandChain {
  readonly beaconId: string;
  readonly chainHash: string;
  readonly genesisSeed: string;
  readonly genesisSeconds: number;
  readonly periodSeconds: number;
  readonly publicKey: string;
  readonly scheme: typeof SIGNATURE_SCHEME;
}

export const QUICKNET: DrandChain = {
  beaconId: "quicknet",
  chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  genesisSeconds: 1_692_803_367,
  genesisSeed:
    "f477d5c89f21a17c863a7f937c6a6d15859414d2be09cd448d4279af331c5d3e",
  periodSeconds: 3,
  publicKey:
    "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
  scheme: SIGNATURE_SCHEME,
};

const MILLIS_PER_SECOND = 1000;

const genesisMillis = (chain: DrandChain) =>
  chain.genesisSeconds * MILLIS_PER_SECOND;

const periodMillis = (chain: DrandChain) =>
  chain.periodSeconds * MILLIS_PER_SECOND;

export const roundTime = (chain: DrandChain, round: BeaconRound): EpochMillis =>
  EpochMillisSchema.make(
    genesisMillis(chain) + (round - 1) * periodMillis(chain)
  );

export const firstFutureRound = (
  chain: DrandChain,
  at: EpochMillis
): BeaconRound => {
  const sinceGenesis = at - genesisMillis(chain);

  return sinceGenesis < 0
    ? 1
    : Math.floor(sinceGenesis / periodMillis(chain)) + 2;
};
