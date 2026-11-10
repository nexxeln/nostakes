import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import {
  BEACON_EARLY_MS,
  beaconWaitLimitMs,
  EpochMillisSchema,
  PHONE_CLOCK_TOLERANCE_MS,
  QUICKNET,
  roundTime,
  roundToSeal,
  SEAL_DELIVERY_BUDGET_MS,
  SealArrivals,
  SEALING_MARGIN_MS,
  sealsWithNoDeal,
  sealTiming,
  SealWithNoDeal,
  SERVER_CLOCK_BUDGET_MS,
} from "../src/index.js";
import type { SealArrival, SealSeen } from "../src/index.js";
import { between } from "./arbitraries.js";

const at = (millis: number) => EpochMillisSchema.make(millis);

const live = (millis: number): SealArrival =>
  SealArrivals.Live({ at: at(millis) });

const caughtUp = (millis: number): SealArrival =>
  SealArrivals.CaughtUp({ at: at(millis) });

const timingTag = (round: number, arrival: SealArrival) =>
  sealTiming(QUICKNET, round, arrival)._tag;

const NOW_ISH = 1_794_310_000_000;

const sealedAt = between(NOW_ISH, NOW_ISH + 10 ** 11);

const quicknetRound = between(1, 100_000_000);

const tolerance = PHONE_CLOCK_TOLERANCE_MS;

describe("the round a seal names", () => {
  it.prop(
    "is the first round due at least the sealing margin after the seal, so it cannot exist yet",
    { sealed: sealedAt },
    ({ sealed }) => {
      const round = roundToSeal(QUICKNET, at(sealed));
      const due = roundTime(QUICKNET, round);

      expect(due - sealed).toBeGreaterThanOrEqual(SEALING_MARGIN_MS);
      expect(roundTime(QUICKNET, round - 1) - sealed).toBeLessThan(
        SEALING_MARGIN_MS
      );
      expect(due - BEACON_EARLY_MS).toBeGreaterThan(sealed);
    }
  );

  it.prop(
    "reaches every phone within tolerance in time when the server's clock and the delivery stay inside their budgets",
    {
      delivery: between(0, SEAL_DELIVERY_BUDGET_MS - 1),
      phoneError: between(-tolerance, tolerance),
      sealed: sealedAt,
      serverError: between(
        -(SERVER_CLOCK_BUDGET_MS - 1),
        SERVER_CLOCK_BUDGET_MS - 1
      ),
    },
    ({ delivery, phoneError, sealed, serverError }) => {
      const round = roundToSeal(QUICKNET, at(sealed + serverError));

      expect(timingTag(round, live(sealed + delivery + phoneError))).toBe(
        "InTime"
      );
    }
  );
});

describe("the client's timing check", () => {
  it.prop(
    "never calls a seal in time when it reached the device after the round could exist, for any clock within tolerance",
    {
      after: between(0, 120_000),
      phoneError: between(-tolerance, tolerance),
      round: quicknetRound,
    },
    ({ after, phoneError, round }) => {
      const couldExist = roundTime(QUICKNET, round) - BEACON_EARLY_MS;

      expect(timingTag(round, live(couldExist + after + phoneError))).not.toBe(
        "InTime"
      );
    }
  );

  it.prop(
    "says a seal arrived after the round whenever the device's clock, less the tolerance, is past the round's time",
    { after: between(0, 120_000), round: quicknetRound },
    ({ after, round }) => {
      const due = roundTime(QUICKNET, round);

      expect(timingTag(round, live(due + tolerance + after))).toBe(
        "ArrivedAfterRound"
      );
    }
  );

  it("draws its three lines a millisecond apart", () => {
    const round = 33_000_000;
    const due = roundTime(QUICKNET, round);
    const inTimeUntil = due - tolerance - BEACON_EARLY_MS;

    expect(
      [inTimeUntil - 1, inTimeUntil, due + tolerance - 1, due + tolerance].map(
        (millis) => timingTag(round, live(millis))
      )
    ).toEqual([
      "InTime",
      "TooCloseToCall",
      "TooCloseToCall",
      "ArrivedAfterRound",
    ]);
  });

  it.prop(
    "gives a seal that reached the device in a catch-up its own answer, however late",
    { offset: between(-60_000, 600_000), round: quicknetRound },
    ({ offset, round }) => {
      expect(
        timingTag(round, caughtUp(roundTime(QUICKNET, round) + offset))
      ).toBe("NotWatched");
    }
  );
});

const problems = (now: number, seen: readonly SealSeen[]) =>
  sealsWithNoDeal(QUICKNET, at(now), seen).map(({ hand, withdrawal }) => ({
    hand,
    withdrawal,
  }));

describe("the server's wait for the beacon", () => {
  it("is five periods of the chain, which is 15 seconds on quicknet", () => {
    expect([
      beaconWaitLimitMs(QUICKNET),
      beaconWaitLimitMs({ ...QUICKNET, periodSeconds: 1 }),
    ]).toEqual([15_000, 5000]);
  });
});

describe("a seal with no deal", () => {
  const round = 33_000_000;
  const due = roundTime(QUICKNET, round);
  const deadline = due + beaconWaitLimitMs(QUICKNET) + SEAL_DELIVERY_BUDGET_MS;

  const seal = (overrides: Partial<SealSeen> = {}): SealSeen => ({
    dealt: false,
    hand: 12,
    round,
    withdrawn: Option.none(),
    ...overrides,
  });

  it("is not reported while the deal may still come, and is once the server's wait for the beacon has run out", () => {
    expect([
      problems(deadline + tolerance - 1, [seal()]),
      problems(deadline + tolerance, [seal()]),
    ]).toEqual([[], [{ hand: 12, withdrawal: "never" }]]);
  });

  it("is not reported for a hand that was dealt", () => {
    expect(problems(deadline + 3_600_000, [seal({ dealt: true })])).toEqual([]);
  });

  it("is not reported when the call-off reached this device before the round could exist", () => {
    const early = due - tolerance - BEACON_EARLY_MS - 1;

    expect(
      problems(deadline + 3_600_000, [
        seal({ withdrawn: Option.some(live(early)) }),
      ])
    ).toEqual([]);
  });

  it("names a call-off that came after the round, too close to it, or while this device was away", () => {
    expect(
      problems(due, [
        seal({ hand: 1, withdrawn: Option.some(live(due + tolerance)) }),
        seal({ hand: 2, withdrawn: Option.some(live(due)) }),
        seal({ hand: 3, withdrawn: Option.some(caughtUp(due - 60_000)) }),
      ])
    ).toEqual([
      { hand: 1, withdrawal: "after the round" },
      { hand: 2, withdrawal: "too close to the round" },
      { hand: 3, withdrawal: "while away" },
    ]);
  });

  it("explains itself to a player", () => {
    const [problem] = sealsWithNoDeal(QUICKNET, at(deadline + tolerance), [
      seal(),
    ]);

    expect(problem).toBeInstanceOf(SealWithNoDeal);
    expect(problem?.message).toBe(
      "Hand 12 was sealed for beacon round 33000000 and never dealt. The round is past and the hand was never dealt or called off. Cancelling a sealed hand is the one way left for a server to throw away a deal it does not like, so every cancelled hand is shown."
    );
  });
});
