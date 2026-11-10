import { SIGNATURE_SCHEME } from "../../src/index.js";
import type { DrandChain } from "../../src/index.js";

export const QUICKNET_TESTNET: DrandChain = {
  beaconId: "quicknet-t",
  chainHash: "cc9c398442737cbd141526600919edd69f1d6f9b4adb67e4d912fbc64341a9a5",
  genesisSeconds: 1_689_232_296,
  genesisSeed:
    "40d49d910472d4adb1d67f65db8332f11b4284eecf05c05c5eacd5eef7d40e2d",
  periodSeconds: 3,
  publicKey:
    "b15b65b46fb29104f6a4b5d1e11a8da6344463973d423661bb0804846a0ecd1ef93c25057f1c0baab2ac53e56c662b66072f6d84ee791a3382bfb055afab1e6a375538d8ffc451104ac971d2dc9b168e2d3246b0be2015969cbaac298f6502da",
  scheme: SIGNATURE_SCHEME,
};

export interface PublishedRound {
  readonly round: number;
  readonly signature: string;
  readonly randomness: string;
  readonly fetchedFrom: string;
}

export const QUICKNET_ROUNDS: readonly PublishedRound[] = [
  {
    fetchedFrom:
      "https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/1",
    randomness:
      "1466a6cd24e327188770752f6134001c64d6efcc590ccc26b721611ad96f165a",
    round: 1,
    signature:
      "b55e7cb2d5c613ee0b2e28d6750aabbb78c39dcc96bd9d38c2c2e12198df95571de8e8e402a0cc48871c7089a2b3af4b",
  },
  {
    fetchedFrom:
      "https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/2",
    randomness:
      "5782d6987841c654515a0e72b2d1ebb4e741234042c37cb19608ae50d93fb60c",
    round: 2,
    signature:
      "b6b6a585449b66eb12e875b64fcbab3799861a00e4dbf092d99e969a5eac57dd3f798acf61e705fe4f093db926626807",
  },
  {
    fetchedFrom:
      "https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/1000000",
    randomness:
      "b22aad4794f7451896f7a371aa46106fd84d919f3f569acd5b2fddf1d1440af3",
    round: 1_000_000,
    signature:
      "83ad29e4c409f9470fc2ef02f90214df49e02b441a1a241a82d622d9f608ef98fd8b11a029f1bee9d9e83b45088abe72",
  },
  {
    fetchedFrom:
      "https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/20000000",
    randomness:
      "f39c98df5525968e6622e0c63edb3d1f9c5607cf780db78abdded36e4b3dba95",
    round: 20_000_000,
    signature:
      "96892582a33552a7b67ba44ef09c3ccd535bbebe760c93ecf45be8958d0c0f06390c6d19d7bf492eb806af7eef6b125c",
  },
  {
    fetchedFrom:
      "https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/33000000",
    randomness:
      "3267554d34a7d7bbd3f547a168cda834dd94ca2f060386d48c49680ea9366cad",
    round: 33_000_000,
    signature:
      "a6d9f863b58d8f1ea7b6fd426feef2b43b22c912b89dce0bdd787ed2b04c703954aced716aba98ff2b4a22a83e48dd35",
  },
];

export const QUICKNET_TESTNET_ROUNDS: readonly PublishedRound[] = [
  {
    fetchedFrom:
      "https://pl-us.testnet.drand.sh/cc9c398442737cbd141526600919edd69f1d6f9b4adb67e4d912fbc64341a9a5/public/1",
    randomness:
      "5c1dd096cd32cd272fcd2ad6e4d46d33713d16618ede11bae63da90edc3fbb1b",
    round: 1,
    signature:
      "81d347e1c4be0e4277112de281d3a52aa1190bbd2f0ad7954e22799d168e61b60b4a0c46fc5a2777963cb739a0243e21",
  },
  {
    fetchedFrom:
      "https://pl-us.testnet.drand.sh/cc9c398442737cbd141526600919edd69f1d6f9b4adb67e4d912fbc64341a9a5/public/2",
    randomness:
      "6f3a1df67f35c81604674f9bf173be73fc4ebd021f9d164e18d4a06f92e4e6ad",
    round: 2,
    signature:
      "b1a1c8be658e157a3204a97617b2ecc208a77977b7a578a1c09b7479814528ff877ee78abea6bbfbc18477c011167699",
  },
  {
    fetchedFrom:
      "https://pl-us.testnet.drand.sh/cc9c398442737cbd141526600919edd69f1d6f9b4adb67e4d912fbc64341a9a5/public/1000000",
    randomness:
      "6653a535b1abc622855f58cb2751df6d84e1c346edb39e85589417f20d2a13b8",
    round: 1_000_000,
    signature:
      "835e79573e374013b24ef3b7884480c58d52e37f1d0a772d0f863a424cee9d85d436e3e0e8149049fc6ec45bdfc80cf1",
  },
  {
    fetchedFrom:
      "https://pl-us.testnet.drand.sh/cc9c398442737cbd141526600919edd69f1d6f9b4adb67e4d912fbc64341a9a5/public/20000000",
    randomness:
      "216d1f27dd93df9676fe372787f8a4f702d04a327ca9530f5e244027ce608f1e",
    round: 20_000_000,
    signature:
      "a867c3dd7e6fc6cf033407079078f4d81e0527065f8f27806091c11c8e99a656f3dadb9174f44abd45a496f2cee1d82b",
  },
  {
    fetchedFrom:
      "https://pl-us.testnet.drand.sh/cc9c398442737cbd141526600919edd69f1d6f9b4adb67e4d912fbc64341a9a5/public/33000000",
    randomness:
      "6e86ce1029128b86e0eb4f245bbcf927525a358004f65d8d8dc3ac024fb941b0",
    round: 33_000_000,
    signature:
      "807500b9fcd92f324485ea14aca1f26e574f42c06c480404b6599a68ee3150c8de0c63e8dcf4ca62e382f4550ffe0a9b",
  },
];

export const DEFAULT_CHAIN_ROUND: PublishedRound = {
  fetchedFrom:
    "https://api.drand.sh/8990e7a9aaed2ffed73dbd7092123d6f289930540d7651336225dc172e51b2ce/public/1000000",
  randomness:
    "a26ba4d229c666f52a06f1a9be1278dcc7a80dbc1dd2004a1ae7b63cb79fd37e",
  round: 1_000_000,
  signature:
    "87e355169c4410a8ad6d3e7f5094b2122932c1062f603e6628aba2e4cb54f46c3bf1083c3537cd3b99e8296784f46fb40e090961cf9634f02c7dc2a96b69fc3c03735bc419962780a71245b72f81882cf6bb9c961bcf32da5624993bb747c9e5",
};

export interface LatestRoundSeen {
  readonly round: number;
  readonly requestSentAt: number;
  readonly responseReceivedAt: number;
  readonly fetchedFrom: string;
}

export const LATEST_QUICKNET_ROUNDS_SEEN: readonly LatestRoundSeen[] = [
  {
    fetchedFrom:
      "https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/latest",
    requestSentAt: 1_794_310_897_870,
    responseReceivedAt: 1_794_310_898_895,
    round: 33_835_844,
  },
  {
    fetchedFrom:
      "https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/latest",
    requestSentAt: 1_794_310_902_924,
    responseReceivedAt: 1_794_310_904_631,
    round: 33_835_846,
  },
  {
    fetchedFrom:
      "https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/latest",
    requestSentAt: 1_794_310_908_663,
    responseReceivedAt: 1_794_310_910_503,
    round: 33_835_848,
  },
];
