import { describe, expect, it } from "@effect/vitest";

import { Events, invariants } from "../../src/index.js";
import {
  baseConfig,
  calls,
  chipCount,
  deckStartingWith,
  occupiedTable,
  play,
  raisesTo,
  seat,
  stacksOf,
  startHand,
} from "../fixtures.js";

const LIMIT = Number.MAX_SAFE_INTEGER;

describe("chip amounts at Number.MAX_SAFE_INTEGER", () => {
  it("Chips: a table holding exactly the limit plays an all-in to the end and still holds exactly the limit", () => {
    const half = Math.floor(LIMIT / 2);

    const hand = play(
      startHand(
        occupiedTable(baseConfig, { 0: half, 1: LIMIT - half }),
        deckStartingWith("Ac Kc Ad Kd 2h 7s 9c Jd 3h")
      ).state,
      [
        [0, raisesTo(half)],
        [1, calls],
      ]
    );

    expect(
      hand.events.filter((event) => Events.$is("PotAwarded")(event))
    ).toStrictEqual([
      Events.PotAwarded({
        amount: chipCount(LIMIT - 1),
        eligible: [seat(0), seat(1)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(LIMIT - 1), seat: seat(1) }],
      }),
    ]);
    expect(stacksOf(hand.state).slice(0, 2)).toStrictEqual([0, LIMIT]);
    expect(invariants(hand.state)).toStrictEqual([]);
  });
});
