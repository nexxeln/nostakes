import { describe, expect, it } from "@effect/vitest";

import { Antes, Commands, Events } from "../../src/index.js";
import type { Event, TableConfig } from "../../src/index.js";
import {
  baseConfig,
  calls,
  chipCount,
  deckStartingWith,
  handOf,
  legalOf,
  occupiedTable,
  play,
  rejection,
  run,
  runCount,
  seat,
  stacksOf,
  startHand,
} from "../fixtures.js";
import { legal } from "./legal.js";

const deck = deckStartingWith("Ac Kc Qc Jc Tc 9c 2d 3d 4d 5h 6h 7s 8s 9s");

const forcedBets = (events: readonly Event[]) =>
  events.filter(
    (event) =>
      Events.$is("AntePosted")(event) ||
      Events.$is("BlindPosted")(event) ||
      Events.$is("StraddlePosted")(event)
  );

const potsOf = (events: readonly Event[]) =>
  events.filter((event) => Events.$is("PotAwarded")(event));

const everyPlayerAnte: TableConfig = {
  ...baseConfig,
  ante: Antes.EveryPlayer({ amount: chipCount(10) }),
};

const bigBlindAnte: TableConfig = {
  ...baseConfig,
  ante: Antes.BigBlindPays({ amount: chipCount(30) }),
};

const smallBlindOfFive = Events.BlindPosted({
  allIn: false,
  amount: chipCount(5),
  blind: "Small",
  seat: seat(1),
});

const bigBlindOfTen = (allIn: boolean) =>
  Events.BlindPosted({
    allIn,
    amount: chipCount(10),
    blind: "Big",
    seat: seat(2),
  });

const bigBlindAnteOf = (amount: number) =>
  Events.AntePosted({
    allIn: false,
    amount: chipCount(amount),
    seat: seat(2),
  });

describe("forced-bet edges (rules 4 to 8)", () => {
  it("Rule 5: with a 10-chip ante, seats all in for the exact ante, for less, and for the ante plus 4 of the big blind each win only their layer, and the last live seat calls only the 4 the big blind put in", () => {
    const started = startHand(
      occupiedTable(everyPlayerAnte, { 0: 10, 1: 7, 2: 14, 3: 1000 }),
      deck
    );

    expect(forcedBets(started.events)).toStrictEqual([
      Events.AntePosted({ allIn: true, amount: chipCount(7), seat: seat(1) }),
      Events.AntePosted({ allIn: false, amount: chipCount(10), seat: seat(2) }),
      Events.AntePosted({ allIn: false, amount: chipCount(10), seat: seat(3) }),
      Events.AntePosted({ allIn: true, amount: chipCount(10), seat: seat(0) }),
      Events.BlindPosted({
        allIn: true,
        amount: chipCount(4),
        blind: "Big",
        seat: seat(2),
      }),
    ]);
    expect(legalOf(started.state)).toStrictEqual(legal(3, false, 4, null));

    const called = play(started.state, [[3, calls]]);

    expect(called.events.slice(0, 2)).toStrictEqual([
      Events.Called({ allIn: false, amount: chipCount(4), seat: seat(3) }),
      Events.RunsAgreed({ runs: runCount(1) }),
    ]);
    expect(potsOf(called.events)).toStrictEqual([
      Events.PotAwarded({
        amount: chipCount(28),
        eligible: [seat(0), seat(1), seat(2), seat(3)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(28), seat: seat(2) }],
      }),
      Events.PotAwarded({
        amount: chipCount(9),
        eligible: [seat(0), seat(2), seat(3)],
        pot: 2,
        run: 1,
        winners: [{ amount: chipCount(9), seat: seat(2) }],
      }),
      Events.PotAwarded({
        amount: chipCount(8),
        eligible: [seat(2), seat(3)],
        pot: 3,
        run: 1,
        winners: [{ amount: chipCount(8), seat: seat(2) }],
      }),
    ]);
    expect(stacksOf(called.state).slice(0, 4)).toStrictEqual([0, 0, 45, 986]);
  });

  it("Rule 4 (TDA RP-11): a short big blind covers its blind before the big-blind ante, across stacks of 10, 25, 35, and 45", () => {
    const posted = [10, 25, 35, 45].map((stack) => {
      const started = startHand(
        occupiedTable(bigBlindAnte, { 0: 1000, 1: 1000, 2: stack }),
        deck
      );

      return {
        deadMoney: handOf(started.state).deadMoney,
        forced: forcedBets(started.events),
      };
    });

    expect(posted).toStrictEqual([
      { deadMoney: 0, forced: [smallBlindOfFive, bigBlindOfTen(true)] },
      {
        deadMoney: 15,
        forced: [bigBlindAnteOf(15), smallBlindOfFive, bigBlindOfTen(true)],
      },
      {
        deadMoney: 25,
        forced: [bigBlindAnteOf(25), smallBlindOfFive, bigBlindOfTen(true)],
      },
      {
        deadMoney: 30,
        forced: [bigBlindAnteOf(30), smallBlindOfFive, bigBlindOfTen(false)],
      },
    ]);
  });

  it("Rule 8: an under-the-gun chain skips a seat that sits out, but may not name it", () => {
    const table = run(
      occupiedTable(
        { ...baseConfig, straddle: { button: true, underTheGun: 3 } },
        { 0: 1000, 1: 1000, 2: 1000, 3: 1000, 4: 1000, 5: 1000 }
      ),
      Commands.SetSittingOut({ seat: seat(4), sittingOut: true })
    ).state;

    const outcome = (straddles: readonly number[]) =>
      rejection(
        table,
        Commands.StartHand({
          deck,
          straddles: straddles.map((index) => seat(index)),
        })
      )?._tag ?? "accepted";

    expect([
      outcome([3, 4]),
      outcome([4]),
      outcome([3, 3]),
      outcome([3, 5]),
      outcome([3, 5, 0]),
    ]).toStrictEqual([
      "StraddleNotAllowed",
      "StraddleNotAllowed",
      "StraddleNotAllowed",
      "accepted",
      "accepted",
    ]);
    expect(
      forcedBets(startHand(table, deck, [3, 5, 0]).events).slice(2)
    ).toStrictEqual([
      Events.StraddlePosted({ amount: chipCount(20), seat: seat(3) }),
      Events.StraddlePosted({ amount: chipCount(40), seat: seat(5) }),
      Events.StraddlePosted({ amount: chipCount(80), seat: seat(0) }),
    ]);
  });
});
