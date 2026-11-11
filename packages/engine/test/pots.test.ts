import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { Commands, Events, TableStates } from "../src/index.js";
import type { TableState } from "../src/index.js";
import {
  baseConfig,
  calls,
  cards,
  chipCount,
  deckStartingWith,
  folds,
  occupiedTable,
  play,
  raisesTo,
  run,
  seat,
  stacksOf,
  startHand,
} from "./fixtures.js";

const deck = deckStartingWith("Ac Kc Qc Jc Tc 9c 2d 3d 4d 5h 6h 7s 8s 9s");

const lastHandOf = (state: TableState) => {
  if (!TableStates.$is("BetweenHands")(state)) {
    throw new Error("expected the hand to be over");
  }

  return Option.getOrThrow(state.lastHand);
};

describe("the fold-out", () => {
  it("gives the big blind the pot in a walk, returning the part of its blind the small blind never matched", () => {
    const walk = play(
      startHand(occupiedTable(baseConfig, { 0: 200, 1: 200, 2: 200 }), deck)
        .state,
      [
        [0, folds],
        [1, folds],
      ]
    );

    expect(walk.events).toStrictEqual([
      Events.Folded({ seat: seat(0) }),
      Events.Folded({ seat: seat(1) }),
      Events.UncalledBetReturned({ amount: chipCount(5), seat: seat(2) }),
      Events.PotAwarded({
        amount: chipCount(10),
        eligible: [seat(2)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(10), seat: seat(2) }],
      }),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(walk.state).slice(0, 3)).toStrictEqual([200, 195, 205]);
    expect(lastHandOf(walk.state)).toStrictEqual({
      bounty: Option.none(),
      hunted: false,
      players: [
        {
          folded: true,
          holeCards: cards("Qc 9c"),
          player: "p0",
          publicCards: [],
          seat: 0,
        },
        {
          folded: true,
          holeCards: cards("Ac Jc"),
          player: "p1",
          publicCards: [],
          seat: 1,
        },
        {
          folded: false,
          holeCards: cards("Kc Tc"),
          player: "p2",
          publicCards: [],
          seat: 2,
        },
      ],
      undealt: cards("2d 3d 4d 5h 6h"),
    });
  });

  it("returns an uncalled raise and awards the rest without revealing any card", () => {
    const stolen = play(
      startHand(occupiedTable(baseConfig, { 0: 200, 1: 200, 2: 200 }), deck)
        .state,
      [
        [0, raisesTo(60)],
        [1, folds],
        [2, folds],
      ]
    );

    expect(stolen.events.slice(3)).toStrictEqual([
      Events.UncalledBetReturned({ amount: chipCount(50), seat: seat(0) }),
      Events.PotAwarded({
        amount: chipCount(25),
        eligible: [seat(0)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(25), seat: seat(0) }],
      }),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(stolen.state).slice(0, 3)).toStrictEqual([215, 195, 190]);
  });

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

describe("pots", () => {
  it("layers a pot at each all-in level, counting a folded seat's chips but making it eligible for none", () => {
    const layered = play(
      startHand(
        occupiedTable(baseConfig, { 0: 50, 1: 120, 2: 1000, 3: 1000 }),
        deck
      ).state,
      [
        [3, raisesTo(80)],
        [0, calls],
        [1, raisesTo(120)],
        [2, calls],
        [3, folds],
      ]
    );

    expect(
      layered.events
        .filter(Events.$is("PotAwarded"))
        .map((award) => [award.amount, award.eligible])
    ).toStrictEqual([
      [200, [seat(0), seat(1), seat(2)]],
      [170, [seat(1), seat(2)]],
    ]);
  });
});
