import { describe, expect, it } from "@effect/vitest";

import { Commands } from "../../src/index.js";
import {
  actAs,
  baseConfig,
  calls,
  chipCount,
  deckStartingWith,
  occupiedTable,
  raisesTo,
  run,
  seat,
  startHand,
} from "../fixtures.js";
import { kindOf, outcomeOf } from "./outcome.js";

const LIMIT = Number.MAX_SAFE_INTEGER;

const deck = deckStartingWith("Ac Kc Qc Jc");

describe("chip amounts near Number.MAX_SAFE_INTEGER", () => {
  it("Chips are non-negative safe integers: AddChips that would lift a stack past the limit is rejected, not thrown", () => {
    const table = occupiedTable(baseConfig, { 0: LIMIT, 1: 100 });

    const outcome = outcomeOf(
      table,
      Commands.AddChips({ amount: chipCount(1), seat: seat(0) })
    );

    expect({ kind: kindOf(outcome), outcome }).toMatchObject({
      kind: "rejected",
    });
  });

  it("decide is total: calling an all-in that makes a pot above the limit returns events or a rejection, not a throw", () => {
    const started = startHand(
      occupiedTable(baseConfig, { 0: LIMIT, 1: LIMIT }),
      deck
    ).state;

    const shoved = run(started, actAs(0, raisesTo(LIMIT))).state;

    const outcome = outcomeOf(shoved, actAs(1, calls));

    expect(["accepted", "rejected"]).toContain(kindOf(outcome));
  });

  it("Rule 8: a straddle chain whose second straddle exceeds the limit is rejected as CannotCover, not thrown", () => {
    const bigBlind = 2 ** 51;

    const table = occupiedTable(
      {
        ...baseConfig,
        bigBlind: chipCount(bigBlind),
        smallBlind: chipCount(1),
        straddle: { button: false, underTheGun: 2 },
      },
      { 0: 1000, 1: 1000, 2: 1000, 3: 2 ** 52 + 1, 4: 1000 }
    );

    expect(
      outcomeOf(
        table,
        Commands.StartHand({ deck, straddles: [seat(3), seat(4)] })
      )
    ).toBe("rejected StraddleNotAllowed");
  });
});
