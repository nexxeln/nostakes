import { describe, expect, it } from "@effect/vitest";

import { Commands } from "../../src/index.js";
import {
  baseConfig,
  calls,
  deckStartingWith,
  occupiedTable,
  play,
  raisesTo,
  run,
  seat,
} from "../fixtures.js";
import { outcomeOf } from "./outcome.js";

const choosingRuns = () =>
  run(
    play(
      run(
        occupiedTable({ ...baseConfig, maxRuns: 2 }, { 0: 100, 1: 100 }),
        Commands.StartHand({ deck: deckStartingWith(""), straddles: [] })
      ).state,
      [
        [0, raisesTo(100)],
        [1, calls],
      ]
    ).state,
    Commands.ChooseRuns({ runs: 2, seat: seat(0) })
  ).state;

describe("decide over every value the Command type admits", () => {
  it("Rule 19: ChooseRuns with 1.5 runs, which the Command type admits, is refused instead of paying out 134 of a 200-chip pot", () => {
    const state = choosingRuns();
    const command = Commands.ChooseRuns({ runs: 1.5, seat: seat(1) });

    expect(outcomeOf(state, command)).toBe("rejected RunsOutOfRange");
  });
});
