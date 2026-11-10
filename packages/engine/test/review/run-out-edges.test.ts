import { describe, expect, it } from "@effect/vitest";

import {
  Commands,
  Events,
  PendingDecisions,
  RunsOutOfRange,
  pendingDecisions,
} from "../../src/index.js";
import type { Event, TableConfig, TableState } from "../../src/index.js";
import {
  baseConfig,
  calls,
  cards,
  checks,
  deckStartingWith,
  folds,
  occupiedTable,
  play,
  raisesTo,
  rejection,
  runAll,
  runCount,
  seat,
  stacksOf,
  startHand,
} from "../fixtures.js";

const runs = (maxRuns: number): TableConfig => ({
  ...baseConfig,
  maxRuns: runCount(maxRuns),
});

const everyoneChooses = (
  state: TableState,
  choices: readonly (readonly [number, number])[]
) =>
  runAll(
    state,
    choices.map(([index, count]) =>
      Commands.ChooseRuns({ runs: runCount(count), seat: seat(index) })
    )
  );

const awardedParts = (events: readonly Event[]) =>
  events.flatMap((event) =>
    Events.$is("PotAwarded")(event)
      ? [
          {
            amount: event.amount,
            pot: event.pot,
            run: event.run,
            winners: event.winners.map((share) => [share.seat, share.amount]),
          },
        ]
      : []
  );

describe("run-out edges (rules 18 to 22)", () => {
  it("Rule 19: nine seats all in before the flop may choose at most 6 runs, because 34 cards cover six five-card boards", () => {
    const allIn = play(
      startHand(
        occupiedTable(
          runs(9),
          Object.fromEntries(
            Array.from({ length: 9 }, (_, index) => [
              index,
              index === 3 ? 1000 : 100 + index,
            ])
          )
        ),
        deckStartingWith("")
      ).state,
      [
        [3, raisesTo(1000)],
        [4, calls],
        [5, calls],
        [6, calls],
        [7, calls],
        [8, calls],
        [0, calls],
        [1, calls],
        [2, calls],
      ]
    ).state;

    expect(pendingDecisions(allIn)).toStrictEqual(
      PendingDecisions.ChooseRuns({
        maxRuns: runCount(6),
        seats: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => seat(index)),
      })
    );
    expect(
      rejection(
        allIn,
        Commands.ChooseRuns({ runs: runCount(7), seat: seat(1) })
      )
    ).toStrictEqual(
      new RunsOutOfRange({
        maxRuns: runCount(6),
        runs: runCount(7),
        seat: seat(1),
      })
    );

    const ran = everyoneChooses(
      allIn,
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => [index, 6] as const)
    );

    const parts = awardedParts(ran.events);

    expect(
      ran.events.filter((event) => Events.$is("RunsAgreed")(event))
    ).toStrictEqual([Events.RunsAgreed({ runs: runCount(6) })]);
    expect(
      ran.events.filter((event) => Events.$is("StreetDealt")(event)).length
    ).toBe(18);
    expect(parts.length).toBe(48);
    expect(parts.reduce((total, part) => total + part.amount, 0)).toBe(941);
  });

  it("Rule 22: a 305-chip pot run three times gives 102, 102, and 101, and inside each run a three-way tie hands the odd chip to the first seats after the button", () => {
    const allIn = play(
      startHand(
        occupiedTable(runs(3), { 0: 100, 1: 1000, 2: 100, 3: 100 }),
        deckStartingWith(
          "2c 3c 4c 5c 2d 3d 4d 5d As Ks Qs Js Ts Ah Kh Qh Jh Th Ad Kd Qd Jd Td"
        )
      ).state,
      [
        [3, raisesTo(100)],
        [0, calls],
        [1, folds],
        [2, calls],
      ]
    ).state;

    const ran = everyoneChooses(allIn, [
      [0, 3],
      [2, 3],
      [3, 3],
    ]);

    expect(awardedParts(ran.events)).toStrictEqual([
      {
        amount: 102,
        pot: 1,
        run: 1,
        winners: [
          [2, 34],
          [3, 34],
          [0, 34],
        ],
      },
      {
        amount: 102,
        pot: 1,
        run: 2,
        winners: [
          [2, 34],
          [3, 34],
          [0, 34],
        ],
      },
      {
        amount: 101,
        pot: 1,
        run: 3,
        winners: [
          [2, 34],
          [3, 34],
          [0, 33],
        ],
      },
    ]);
    expect(stacksOf(ran.state).slice(0, 4)).toStrictEqual([101, 995, 102, 102]);
  });

  it("Rule 21: after an all-in on the turn, each run deals only its own river from the next card of the deck", () => {
    const allIn = play(
      startHand(
        occupiedTable(runs(2), { 0: 1000, 1: 500 }),
        deckStartingWith("Ah Kh Ad Kd 2c 7s 9h Jc 3c 4d 5s")
      ).state,
      [
        [0, calls],
        [1, checks],
        [1, checks],
        [0, checks],
        [1, raisesTo(490)],
        [0, calls],
      ]
    ).state;

    const ran = everyoneChooses(allIn, [
      [0, 2],
      [1, 2],
    ]);

    expect(
      ran.events.filter((event) => Events.$is("StreetDealt")(event))
    ).toStrictEqual([
      Events.StreetDealt({ cards: cards("3c"), run: 1, street: "River" }),
      Events.StreetDealt({ cards: cards("4d"), run: 2, street: "River" }),
    ]);
    expect(stacksOf(ran.state).slice(0, 2)).toStrictEqual([500, 1000]);
  });

  it("Rules 19 and 22: three seats on the flop choose 2, 3, and 3, so the board runs twice and each run awards the main and side pots by its own board", () => {
    const allIn = play(
      startHand(
        occupiedTable(runs(3), { 0: 1000, 1: 300, 2: 1000 }),
        deckStartingWith("Ah Ad Kh Kd Qh Qd 2c 7d 9s Jc Tc 3h 4h")
      ).state,
      [
        [0, calls],
        [1, calls],
        [2, checks],
        [1, raisesTo(290)],
        [2, calls],
        [0, raisesTo(990)],
        [2, calls],
      ]
    ).state;

    const ran = everyoneChooses(allIn, [
      [0, 2],
      [1, 3],
      [2, 3],
    ]);

    expect(
      ran.events.filter((event) => Events.$is("RunsAgreed")(event))
    ).toStrictEqual([Events.RunsAgreed({ runs: runCount(2) })]);
    expect(awardedParts(ran.events)).toStrictEqual([
      { amount: 450, pot: 1, run: 1, winners: [[0, 450]] },
      { amount: 700, pot: 2, run: 1, winners: [[0, 700]] },
      { amount: 450, pot: 1, run: 2, winners: [[1, 450]] },
      { amount: 700, pot: 2, run: 2, winners: [[2, 700]] },
    ]);
    expect(stacksOf(ran.state).slice(0, 3)).toStrictEqual([1150, 450, 700]);
  });
});
