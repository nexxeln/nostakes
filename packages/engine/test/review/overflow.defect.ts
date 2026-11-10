import { describe, expect, it } from "@effect/vitest";

import { Commands } from "../../src/index.js";
import {
  baseConfig,
  chipCount,
  deckStartingWith,
  occupiedTable,
  seat,
} from "../fixtures.js";
import { outcomeOf } from "./outcome.js";

const deck = deckStartingWith("Ac Kc Qc Jc");

describe("chip amounts near Number.MAX_SAFE_INTEGER", () => {
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
