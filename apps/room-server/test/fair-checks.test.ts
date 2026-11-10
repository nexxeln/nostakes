import { describe, expect, it } from "@effect/vitest";
import { SeatIndexSchema } from "@nostakes/engine";
import {
  emptyWitness,
  MillisSchema,
  SeenEventSchema,
  witnessEvent,
} from "@nostakes/room";
import {
  BeaconRoundSchema,
  DigestSchema,
  EpochMillisSchema,
  roundTime,
  SealArrivals,
} from "@nostakes/shuffle";

import { undealtSeals } from "./fixtures/fair-checks.js";
import { TEST_CHAIN } from "./fixtures/test-beacon.js";

const ROUND = BeaconRoundSchema.make(101_520_000);

const DUE = roundTime(TEST_CHAIN, ROUND);

const SEALED_AT = DUE - 4000;

const sealedWitness = witnessEvent(
  emptyWitness,
  SeenEventSchema.cases.HandSealed.make({
    at: MillisSchema.make(SEALED_AT),
    hand: 7,
    roots: [
      DigestSchema.make(new Uint8Array(32)),
      DigestSchema.make(new Uint8Array(32).fill(1)),
    ],
    round: ROUND,
    seats: [SeatIndexSchema.make(0), SeatIndexSchema.make(3)],
  }),
  SealArrivals.Live({ at: EpochMillisSchema.make(SEALED_AT + 50) })
);

const withdrawals = (stretches: Parameters<typeof undealtSeals>[0]) =>
  undealtSeals(stretches).map((problem) => problem.withdrawal);

describe("judging a sealed hand a device never saw dealt", () => {
  it("names a seal the device watched past the server's last moment to deal it", () => {
    expect(
      withdrawals([{ lastHeardAt: DUE + 20_000, witness: sealedWitness }])
    ).toStrictEqual(["never"]);
  });

  it("says nothing of a seal whose device stopped hearing the room before that moment", () => {
    expect(
      withdrawals([{ lastHeardAt: DUE + 5000, witness: sealedWitness }])
    ).toStrictEqual([]);
  });

  it("says nothing of a seal whose deal fell in a range the device skipped, even when it listened long after", () => {
    expect(
      withdrawals([
        { lastHeardAt: DUE - 1000, witness: sealedWitness },
        { lastHeardAt: DUE + 60_000, witness: sealedWitness },
      ])
    ).toStrictEqual([]);
  });
});
