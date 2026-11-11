import { describe, expect, it } from "@effect/vitest";

import { Commands, Events } from "../src/index.js";
import {
  baseConfig,
  chipCount,
  deckStartingWith,
  folds,
  occupiedTable,
  play,
  run,
  seat,
  stacksOf,
  startHand,
} from "./fixtures.js";

const deck = deckStartingWith("Ac Kc Qc Jc Tc 9c 2d 3d 4d 5h 6h 7s 8s 9s");

describe("the fold-out", () => {
  it("returns to a short all-in big blind the part of its blind that the folding small blind never matched", () => {
    const short = play(
      startHand(occupiedTable(baseConfig, { 0: 200, 1: 200, 2: 8 }), deck)
        .state,
      [
        [0, folds],
        [1, folds],
      ]
    );

    expect(short.events.slice(2)).toStrictEqual([
      Events.UncalledBetReturned({ amount: chipCount(3), seat: seat(2) }),
      Events.PotAwarded({
        amount: chipCount(10),
        eligible: [seat(2)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(10), seat: seat(2) }],
      }),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(short.state).slice(0, 3)).toStrictEqual([200, 195, 13]);
  });
});

describe("the button", () => {
  it("moves to the next dealt-in seat clockwise from the last button, even after that seat empties (home-game rule)", () => {
    const first = play(
      startHand(
        occupiedTable(baseConfig, { 2: 200, 4: 200, 6: 200, 8: 200 }),
        deck
      ).state,
      [
        [8, folds],
        [2, folds],
        [4, folds],
      ]
    ).state;

    const emptied = run(first, Commands.StandUp({ seat: seat(2) })).state;
    const second = startHand(emptied, deck);

    expect(second.events[0]).toStrictEqual(
      Events.HandStarted({
        bigBlindSeat: seat(8),
        button: seat(4),
        dealtIn: [seat(4), seat(6), seat(8)],
        deck,
        handNumber: 2,
        smallBlindSeat: seat(6),
      })
    );
  });
});
