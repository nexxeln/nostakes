import { describe, expect, it } from "@effect/vitest";

import {
  Commands,
  Events,
  NoRunChoiceOwed,
  PendingDecisions,
  RunsOutOfRange,
  Phases,
  ShowdownEntries,
  evaluate,
  evolveAll,
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
  seat,
  stacksOf,
  startHand,
} from "./fixtures.js";

const ACES = "Ah Ad";

const KINGS = "Kh Kd";

const ACES_WIN = "2c 7s 9d Jc 3s";

const KINGS_WIN = "Kc 4s 8d Tc 5s";

const ACES_WIN_AGAIN = "6c 6s 2d 3d 4h";

const runsConfig = (maxRuns: number): TableConfig => ({
  ...baseConfig,
  maxRuns,
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
  Commands.ChooseRuns({ runs, seat: seat(index) });

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
  it("runs an all-in before the flop once, tabling both hands first, when maxRuns is 1 and no one is asked to choose", () => {
    const allIn = headsUpAllIn(1, 100);

    expect(allIn.events.some(Events.$is("RunsChosen"))).toBe(false);
    expect(runOutEvents(allIn.events)).toStrictEqual([
      Events.RunsAgreed({ runs: 1 }),
      Events.HandsTabled({
        hands: [
          { cards: cards(ACES), seat: seat(1) },
          { cards: cards(KINGS), seat: seat(0) },
        ],
      }),
      ...dealtStreets(1, ACES_WIN),
      Events.ShowdownReached({
        order: [shownOn(1, ACES, ACES_WIN), shownOn(0, KINGS, ACES_WIN)],
        run: 1,
      }),
      awarded(1, 200, 1),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(allIn.state).slice(0, 2)).toStrictEqual([0, 200]);
  });

  it("asks every seat still in for a run count before any hand is tabled", () => {
    const allIn = headsUpAllIn(3, 100);

    expect(allIn.events.at(-1)).toStrictEqual(
      Events.Called({ allIn: true, amount: chipCount(90), seat: seat(1) })
    );
    expect(pendingDecisions(allIn.state)).toStrictEqual(
      PendingDecisions.ChooseRuns({ maxRuns: 3, seats: [seat(0), seat(1)] })
    );
  });

  it("runs twice with a different winner on each board and half the pot on each", () => {
    const twice = runAll(headsUpAllIn(2, 100).state, [
      choose(0, 2),
      choose(1, 2),
    ]);

    expect(runOutEvents(twice.events)).toStrictEqual([
      Events.RunsAgreed({ runs: 2 }),
      Events.HandsTabled({
        hands: [
          { cards: cards(ACES), seat: seat(1) },
          { cards: cards(KINGS), seat: seat(0) },
        ],
      }),
      ...dealtStreets(1, ACES_WIN),
      ...dealtStreets(2, KINGS_WIN),
      Events.ShowdownReached({
        order: [shownOn(1, ACES, ACES_WIN), shownOn(0, KINGS, ACES_WIN)],
        run: 1,
      }),
      awarded(1, 100, 1),
      Events.ShowdownReached({
        order: [shownOn(1, ACES, KINGS_WIN), shownOn(0, KINGS, KINGS_WIN)],
        run: 2,
      }),
      awarded(2, 100, 0),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(twice.state).slice(0, 2)).toStrictEqual([100, 100]);

    const dealt = twice.events.findLastIndex(Events.$is("StreetDealt")) + 1;

    const midRun = handOf(
      evolveAll(headsUpAllIn(2, 100).state, twice.events.slice(0, dealt))
    );

    expect(midRun.board).toStrictEqual([]);
    expect(midRun.phase).toStrictEqual(
      Phases.RunningOut({ runs: [cards(ACES_WIN), cards(KINGS_WIN)] })
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
      Events.RunsAgreed({ runs: 2 }),
    ]);
  });

  it("lets any one seat insist on running once", () => {
    const once = runAll(headsUpAllIn(3, 100).state, [
      choose(0, 1),
      choose(1, 3),
    ]);

    expect(once.events.filter(Events.$is("RunsAgreed"))).toStrictEqual([
      Events.RunsAgreed({ runs: 1 }),
    ]);
    expect(once.events.filter(Events.$is("StreetDealt"))).toHaveLength(3);
  });

  it("refuses a run count above the cap, a second choice from the same seat, and a choice when none is owed", () => {
    const allIn: TableState = headsUpAllIn(3, 100).state;
    const chosen = run(allIn, choose(0, 2)).state;

    expect(rejection(allIn, choose(0, 4))).toStrictEqual(
      new RunsOutOfRange({ maxRuns: 3, runs: 4, seat: seat(0) })
    );
    expect(rejection(chosen, choose(0, 2))).toStrictEqual(
      new NoRunChoiceOwed({ seat: seat(0) })
    );
    expect(
      rejection(occupiedTable(baseConfig, { 0: 100 }), choose(0, 1))
    ).toStrictEqual(new NoRunChoiceOwed({ seat: seat(0) }));
  });
});
