import { describe, expect, it } from "@effect/vitest";

import {
  Commands,
  Events,
  NoRunChoiceOwed,
  PendingDecisions,
  RunsOutOfRange,
  ShowdownEntries,
  evaluate,
  pendingDecisions,
} from "../src/index.js";
import type { Event, TableConfig, TableState } from "../src/index.js";
import {
  baseConfig,
  calls,
  cards,
  chipCount,
  deckStartingWith,
  handOf,
  occupiedTable,
  play,
  raisesTo,
  rejection,
  run,
  runAll,
  runCount,
  seat,
  stacksOf,
  startHand,
} from "./fixtures.js";

const ACES = "Ah Ad";

const ACES_WIN = "2c 7s 9d Jc 3s";

const KINGS_WIN = "Kc 4s 8d Tc 5s";

const ACES_WIN_AGAIN = "6c 6s 2d 3d 4h";

const runsConfig = (maxRuns: number): TableConfig => ({
  ...baseConfig,
  maxRuns: runCount(maxRuns),
});

const headsUpAllIn = (maxRuns: number, stack: number) =>
  play(
    startHand(
      occupiedTable(runsConfig(maxRuns), { 0: stack, 1: stack }),
      deckStartingWith(`Ah Kh Ad Kd ${ACES_WIN} ${KINGS_WIN} ${ACES_WIN_AGAIN}`)
    ).state,
    [
      [0, raisesTo(stack)],
      [1, calls],
    ]
  );

const choose = (index: number, runs: number) =>
  Commands.ChooseRuns({ runs: runCount(runs), seat: seat(index) });

const shownOn = (index: number, hole: string, board: string) =>
  ShowdownEntries.Shown({
    cards: cards(hole),
    rank: evaluate(cards(`${hole} ${board}`)),
    seat: seat(index),
  });

const awarded = (runNumber: number, amount: number, winner: number) =>
  Events.PotAwarded({
    amount: chipCount(amount),
    eligible: [seat(0), seat(1)],
    pot: 1,
    run: runNumber,
    winners: [{ amount: chipCount(amount), seat: seat(winner) }],
  });

const dealtStreets = (runNumber: number, board: string) => {
  const [flopOne = "", flopTwo = "", flopThree = "", turn = "", river = ""] =
    board.split(" ");

  return [
    Events.StreetDealt({
      cards: cards(`${flopOne} ${flopTwo} ${flopThree}`),
      run: runNumber,
      street: "Flop",
    }),
    Events.StreetDealt({ cards: cards(turn), run: runNumber, street: "Turn" }),
    Events.StreetDealt({
      cards: cards(river),
      run: runNumber,
      street: "River",
    }),
  ];
};

const runOutEvents = (events: readonly Event[]) =>
  events.slice(events.findIndex(Events.$is("RunsAgreed")));

describe("running the board", () => {
  it("asks every seat still in for a run count before any hand is tabled", () => {
    const allIn = headsUpAllIn(3, 100);

    expect(allIn.events.at(-1)).toStrictEqual(
      Events.Called({ allIn: true, amount: chipCount(90), seat: seat(1) })
    );
    expect(pendingDecisions(allIn.state)).toStrictEqual(
      PendingDecisions.ChooseRuns({
        maxRuns: runCount(3),
        seats: [seat(0), seat(1)],
      })
    );
  });

  it("runs three times and gives the leftover chip of an odd pot to the first run", () => {
    const thrice = runAll(headsUpAllIn(3, 101).state, [
      choose(0, 3),
      choose(1, 3),
    ]);

    expect(thrice.events.filter(Events.$is("PotAwarded"))).toStrictEqual([
      awarded(1, 68, 1),
      awarded(2, 67, 0),
      awarded(3, 67, 1),
    ]);
    expect(stacksOf(thrice.state).slice(0, 2)).toStrictEqual([67, 135]);
  });

  it("runs the smallest count anyone chose: 3 and 2 give 2", () => {
    const chosen = runAll(headsUpAllIn(3, 100).state, [
      choose(0, 3),
      choose(1, 2),
    ]);

    expect(chosen.events.filter(Events.$is("RunsAgreed"))).toStrictEqual([
      Events.RunsAgreed({ runs: runCount(2) }),
    ]);
  });

  it("Rule 19 amended: a seat that chooses one run settles the count at once, so the board runs once without waiting for the other seat", () => {
    const once = run(headsUpAllIn(3, 100).state, choose(0, 1));

    expect(once.events.map((event) => event._tag)).toStrictEqual([
      "RunsChosen",
      "RunsAgreed",
      "HandsTabled",
      "StreetDealt",
      "StreetDealt",
      "StreetDealt",
      "ShowdownReached",
      "PotAwarded",
      "HandEnded",
    ]);
    expect(once.events.slice(0, 2)).toStrictEqual([
      Events.RunsChosen({ runs: runCount(1), seat: seat(0) }),
      Events.RunsAgreed({ runs: runCount(1) }),
    ]);
    expect(rejection(once.state, choose(1, 3))).toStrictEqual(
      new NoRunChoiceOwed({ seat: seat(1) })
    );
  });

  it("refuses a run count above the cap, a second choice from the same seat, and a choice when none is owed", () => {
    const allIn: TableState = headsUpAllIn(3, 100).state;
    const chosen = run(allIn, choose(0, 2)).state;

    expect(rejection(allIn, choose(0, 4))).toStrictEqual(
      new RunsOutOfRange({
        maxRuns: runCount(3),
        runs: runCount(4),
        seat: seat(0),
      })
    );
    expect(rejection(chosen, choose(0, 2))).toStrictEqual(
      new NoRunChoiceOwed({ seat: seat(0) })
    );
    expect(
      rejection(occupiedTable(baseConfig, { 0: 100 }), choose(0, 1))
    ).toStrictEqual(new NoRunChoiceOwed({ seat: seat(0) }));
  });
});

const hiddenConfig = (
  maxRuns: number,
  showdown: TableConfig["showdown"]
): TableConfig => ({
  ...runsConfig(maxRuns),
  allInHands: "Hidden",
  showdown,
});

const hiddenAllIn = (
  maxRuns: number,
  showdown: TableConfig["showdown"],
  boards: string
) =>
  play(
    startHand(
      occupiedTable(hiddenConfig(maxRuns, showdown), { 0: 100, 1: 100 }),
      deckStartingWith(`Ah Kh Ad Kd ${boards}`)
    ).state,
    [
      [0, raisesTo(100)],
      [1, calls],
    ]
  );

describe("hands kept hidden when all in", () => {
  it("deals the board without tabling, then shows the winner and mucks the beaten hand", () => {
    const allIn = hiddenAllIn(1, "Automatic", ACES_WIN);

    expect(allIn.events.some(Events.$is("HandsTabled"))).toBe(false);
    expect(runOutEvents(allIn.events)).toStrictEqual([
      Events.RunsAgreed({ runs: runCount(1) }),
      ...dealtStreets(1, ACES_WIN),
      Events.ShowdownReached({
        order: [
          shownOn(1, ACES, ACES_WIN),
          ShowdownEntries.Mucked({ seat: seat(0) }),
        ],
        run: 1,
      }),
      awarded(1, 200, 1),
      Events.HandEnded({ handNumber: 1 }),
    ]);
  });

  it("shows a hand on every run when it wins or ties part of a pot on any run, and mucks it on every run otherwise", () => {
    const split = runAll(
      hiddenAllIn(2, "Automatic", `${ACES_WIN} ${KINGS_WIN}`).state,
      [choose(0, 2), choose(1, 2)]
    );

    expect(
      split.events
        .filter(Events.$is("ShowdownReached"))
        .map((reached) => reached.order.map((entry) => entry._tag))
    ).toStrictEqual([
      ["Shown", "Shown"],
      ["Shown", "Shown"],
    ]);

    const sweep = runAll(
      hiddenAllIn(2, "Automatic", `${ACES_WIN} ${ACES_WIN_AGAIN}`).state,
      [choose(0, 2), choose(1, 2)]
    );

    expect(sweep.events.filter(Events.$is("ShowdownReached"))).toStrictEqual([
      Events.ShowdownReached({
        order: [
          shownOn(1, ACES, ACES_WIN),
          ShowdownEntries.Mucked({ seat: seat(0) }),
        ],
        run: 1,
      }),
      Events.ShowdownReached({
        order: [
          shownOn(1, ACES, ACES_WIN_AGAIN),
          ShowdownEntries.Mucked({ seat: seat(0) }),
        ],
        run: 2,
      }),
    ]);
    expect(stacksOf(sweep.state).slice(0, 2)).toStrictEqual([0, 200]);
  });

  it("deals one run onto the board and then asks each seat to table or muck when the showdown is interactive", () => {
    const allIn = hiddenAllIn(1, "Interactive", ACES_WIN);

    expect(runOutEvents(allIn.events)).toStrictEqual([
      Events.RunsAgreed({ runs: runCount(1) }),
      ...dealtStreets(1, ACES_WIN),
      Events.ShowdownStarted({ order: [seat(1), seat(0)] }),
    ]);
    expect(handOf(allIn.state).board).toStrictEqual(cards(ACES_WIN));
    expect(handOf(allIn.state).street).toBe("River");

    const tabled = run(allIn.state, Commands.TableHand({ seat: seat(1) }));
    const mucked = run(tabled.state, Commands.MuckHand({ seat: seat(0) }));

    expect(mucked.events).toStrictEqual([
      Events.HandMucked({ seat: seat(0) }),
      awarded(1, 200, 1),
      Events.HandEnded({ handNumber: 1 }),
    ]);
  });
});

describe("a fixed number of runs", () => {
  it("runs the board the most times allowed with no vote when the room fixes the count", () => {
    const fixed = play(
      startHand(
        occupiedTable(
          { ...runsConfig(2), runCount: "Fixed" },
          { 0: 100, 1: 100 }
        ),
        deckStartingWith(`Ah Kh Ad Kd ${ACES_WIN} ${KINGS_WIN}`)
      ).state,
      [
        [0, raisesTo(100)],
        [1, calls],
      ]
    );

    expect(fixed.events.some(Events.$is("RunsChosen"))).toBe(false);
    expect(fixed.events.find(Events.$is("RunsAgreed"))).toStrictEqual(
      Events.RunsAgreed({ runs: runCount(2) })
    );
    expect(fixed.events.filter(Events.$is("PotAwarded"))).toStrictEqual([
      awarded(1, 100, 1),
      awarded(2, 100, 0),
    ]);
    expect(rejection(fixed.state, choose(0, 1))).toStrictEqual(
      new NoRunChoiceOwed({ seat: seat(0) })
    );
  });
});
