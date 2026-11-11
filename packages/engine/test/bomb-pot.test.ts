import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import {
  Antes,
  BombPots,
  BombPotsOff,
  Commands,
  Events,
  Phases,
  Seats,
  SevenDeuces,
  StraddleNotAllowed,
  TableStates,
  buildPots,
} from "../src/index.js";
import type { Command, Event, TableConfig, TableState } from "../src/index.js";
import {
  baseConfig,
  calls,
  checks,
  chipCount,
  deckStartingWith,
  folds,
  occupiedTable,
  play,
  player,
  raisesTo,
  rejection,
  run,
  runAll,
  runCount,
  seat,
  stacksOf,
} from "./fixtures.js";
import { seededRandom } from "./random.js";
import { handsIn, playSession, session } from "./sessions.js";
import type { Session } from "./sessions.js";

const ANTE = 20;

const bombs = (everyHands: number, config: TableConfig = baseConfig) => ({
  ...config,
  bombPot: BombPots.BombPots({ ante: chipCount(ANTE), everyHands }),
});

const called = bombs(0);

const DECK = deckStartingWith("Ac Kc Qc Ad Kd Qd 2s 7h 9d Jc 4s");

const start = (bombPot = false, straddles: readonly number[] = []) =>
  Commands.StartHand({
    bombPot,
    deck: DECK,
    straddles: straddles.map((index) => seat(index)),
  });

const EVEN_STACKS = {
  0: 200,
  1: 200,
  2: 200,
};

const three = (config: TableConfig, stacks = EVEN_STACKS) =>
  occupiedTable(config, stacks);

const owesAtFive = (state: TableState) => {
  const { 5: occupant } = state.seats;

  return occupant !== undefined && Seats.$is("Occupied")(occupant)
    ? occupant.owes
    : undefined;
};

const tags = (events: readonly Event[]) => events.map((event) => event._tag);

const potsOf = (state: TableState) =>
  TableStates.$is("InHand")(state)
    ? buildPots(state.hand).map((pot) => [pot.amount, pot.eligible])
    : [];

const toActOf = (state: TableState) =>
  TableStates.$is("InHand")(state) && Phases.$is("Betting")(state.hand.phase)
    ? state.hand.phase.toAct
    : undefined;

const startedIn = (events: readonly Event[]) =>
  events.find(Events.$is("HandStarted"));

const checkedDownFrom = (first: number) =>
  Array.from({ length: 9 }, (_, turn): readonly [number, typeof checks] => [
    (first + turn) % 3,
    checks,
  ]);

describe("a bomb pot", () => {
  it("takes the ante from every seat dealt in, posts no blind, deals the flop at once, and opens the betting left of the button", () => {
    const table = three(called);
    const dealt = run(table, start(true));

    expect(tags(dealt.events)).toStrictEqual([
      "HandStarted",
      "AntePosted",
      "AntePosted",
      "AntePosted",
      "HoleCardsDealt",
      "HoleCardsDealt",
      "HoleCardsDealt",
      "StreetDealt",
    ]);
    expect(startedIn(dealt.events)?.bombPot).toStrictEqual({
      ante: chipCount(ANTE),
      bigBlind: chipCount(10),
    });
    expect(stacksOf(dealt.state).slice(0, 3)).toStrictEqual([180, 180, 180]);
    expect(potsOf(dealt.state)).toStrictEqual([
      [60, [seat(0), seat(1), seat(2)]],
    ]);
    expect(toActOf(dealt.state)).toBe(1);
    expect(
      TableStates.$is("InHand")(dealt.state) ? dealt.state.hand.street : ""
    ).toBe("Flop");
  });

  it("plays on from the flop like any hand, and the smallest bet is the big blind", () => {
    const table = three(called);

    const played = play(run(table, start(true)).state, [
      [1, raisesTo(10)],
      [2, folds],
      [0, calls],
      [1, checks],
      [0, checks],
      [1, checks],
      [0, checks],
    ]);

    expect(played.events.at(-1)).toStrictEqual(
      Events.HandEnded({ handNumber: 1 })
    );
    expect(
      played.events
        .filter(Events.$is("PotAwarded"))
        .map((award) => award.amount)
    ).toStrictEqual([80]);
    expect(
      rejection(
        run(table, start(true)).state,
        Commands.Act({ action: raisesTo(9), seat: seat(1) })
      )?._tag
    ).toBe("IllegalAction");
  });

  it("is refused while bomb pots are off, and takes no straddle", () => {
    const off = three(baseConfig);
    const on = three(called);

    expect(rejection(off, start(true))).toStrictEqual(
      new BombPotsOff({ handNumber: 1 })
    );
    expect(rejection(on, start(true, [0]))).toStrictEqual(
      new StraddleNotAllowed({ reason: "BombPot", straddles: [seat(0)] })
    );
  });

  it("comes by itself every so many hands, and a call makes any hand one", () => {
    const table = three(bombs(2));

    const first = play(run(table, start()).state, [
      [0, folds],
      [1, folds],
    ]);

    const second = run(first.state, start());

    expect(startedIn(run(table, start()).events)?.bombPot).toBeUndefined();
    expect(startedIn(second.events)?.bombPot).toBeDefined();
    expect(startedIn(run(table, start(true)).events)?.bombPot).toBeDefined();
  });

  it("puts a seat with less than the ante all in for what it has, with a side pot before any card is seen", () => {
    const table = three(called, { 0: 200, 1: 8, 2: 200 });
    const dealt = run(table, start(true));

    expect(
      dealt.events
        .filter(Events.$is("AntePosted"))
        .map((ante) => [ante.seat, ante.amount, ante.allIn])
    ).toStrictEqual([
      [1, 8, true],
      [2, 20, false],
      [0, 20, false],
    ]);
    expect(potsOf(dealt.state)).toStrictEqual([
      [24, [seat(0), seat(1), seat(2)]],
      [24, [seat(0), seat(2)]],
    ]);
    expect(toActOf(dealt.state)).toBe(2);
  });

  it("gives back the part of an ante no other seat could match, and runs the board out when nobody can bet", () => {
    const table = three(called, { 0: 200, 1: 8, 2: 5 });
    const dealt = run(table, start(true));

    expect(
      dealt.events.filter(Events.$is("UncalledBetReturned"))
    ).toStrictEqual([
      Events.UncalledBetReturned({ amount: chipCount(12), seat: seat(0) }),
    ]);
    expect(
      dealt.events
        .filter(Events.$is("PotAwarded"))
        .map((award) => [award.amount, award.eligible])
    ).toStrictEqual([
      [15, [seat(0), seat(1), seat(2)]],
      [6, [seat(0), seat(1)]],
    ]);
    expect(dealt.events.at(-1)).toStrictEqual(
      Events.HandEnded({ handNumber: 1 })
    );
    expect(
      stacksOf(dealt.state)
        .slice(0, 3)
        .reduce<number>((total, stack) => total + (stack ?? 0), 0)
    ).toBe(213);
  });

  it("deals the flop before anyone chooses how often to run the board, so every run shares it", () => {
    const table = three(bombs(0, { ...baseConfig, maxRuns: runCount(2) }), {
      0: 20,
      1: 20,
      2: 20,
    });

    const dealt = run(table, start(true));

    expect(tags(dealt.events).slice(-1)).toStrictEqual(["StreetDealt"]);
    expect(
      TableStates.$is("InHand")(dealt.state)
        ? [dealt.state.hand.phase._tag, dealt.state.hand.board.length]
        : []
    ).toStrictEqual(["ChoosingRuns", 3]);

    const chosen = runAll(
      dealt.state,
      [0, 1, 2].map((index) =>
        Commands.ChooseRuns({ runs: runCount(2), seat: seat(index) })
      )
    );

    expect(
      chosen.events
        .filter(Events.$is("StreetDealt"))
        .map((street) => [street.run, street.street])
    ).toStrictEqual([
      [1, "Turn"],
      [1, "River"],
      [2, "Turn"],
      [2, "River"],
    ]);
    expect(chosen.events.at(-1)).toStrictEqual(
      Events.HandEnded({ handNumber: 1 })
    );
  });

  it("replaces the table's ante, whoever pays it in other hands", () => {
    const table = three(
      bombs(0, {
        ...baseConfig,
        ante: Antes.BigBlindPays({ amount: chipCount(10) }),
      }),
      { 0: 200, 1: 8, 2: 200 }
    );

    expect(potsOf(run(table, start(true)).state)).toStrictEqual([
      [24, [seat(0), seat(1), seat(2)]],
      [24, [seat(0), seat(2)]],
    ]);
  });

  it("leaves the button and the blinds where they were, and moves its own button when two come in a row", () => {
    const table = three(called);

    const first = run(table, start());

    const afterFirst = play(first.state, [
      [0, folds],
      [1, folds],
    ]).state;

    const bomb = run(afterFirst, start(true));
    const afterBomb = play(bomb.state, checkedDownFrom(2)).state;
    const secondBomb = run(afterBomb, start(true));
    const afterSecond = play(secondBomb.state, checkedDownFrom(0)).state;
    const third = run(afterSecond, start());

    const positions = (events: readonly Event[]) => {
      const started = startedIn(events);

      return [started?.button, started?.smallBlindSeat, started?.bigBlindSeat];
    };

    expect(positions(first.events)).toStrictEqual([0, 1, 2]);
    expect(startedIn(bomb.events)?.button).toBe(1);
    expect(startedIn(secondBomb.events)?.button).toBe(2);
    expect(positions(third.events)).toStrictEqual([1, 2, 0]);
  });

  it("deals in a seat that owes a blind, and the seat owes the same afterwards", () => {
    const casino = bombs(0, { ...baseConfig, blindPosting: "Casino" });
    const table = three(casino);

    const afterFirst = play(run(table, start()).state, [
      [0, folds],
      [1, folds],
    ]).state;

    const joined = run(
      afterFirst,
      Commands.SitDown({
        buyIn: chipCount(200),
        player: player("late"),
        seat: seat(5),
      })
    ).state;

    const bomb = run(joined, start(true));

    expect(owesAtFive(joined)).toStrictEqual({
      big: false,
      entry: true,
      small: false,
    });
    expect(startedIn(bomb.events)?.dealtIn).toStrictEqual([
      seat(0),
      seat(1),
      seat(2),
      seat(5),
    ]);
    expect(owesAtFive(bomb.state)).toStrictEqual(owesAtFive(joined));
    expect(bomb.events.some(Events.$is("BlindPosted"))).toBe(false);
  });

  it("pays no seven-deuce bounty", () => {
    const table = three({
      ...called,
      sevenDeuce: SevenDeuces.Bounty({ amount: chipCount(30) }),
    });

    const dealt = run(
      table,
      Commands.StartHand({
        bombPot: true,
        deck: deckStartingWith("7h Kc Qc 2c Kd Qd As 9h 4d"),
        straddles: [],
      })
    );

    const won = play(dealt.state, [
      [1, raisesTo(40)],
      [2, folds],
      [0, folds],
    ]);

    expect(won.events.at(-1)).toStrictEqual(
      Events.HandEnded({ handNumber: 1 })
    );
    expect(won.events.some(Events.$is("BountyPaid"))).toBe(false);
  });
});

interface Ante {
  readonly amount: number;
  readonly seat: number;
}

const potsFromAntes = (antes: readonly Ante[]) => {
  const second =
    antes.toSorted((left, right) => right.amount - left.amount)[1]?.amount ?? 0;

  const matched = antes.map(({ amount, seat: at }) => ({
    amount: Math.min(amount, second),
    seat: at,
  }));

  const levels = [
    ...new Set(matched.flatMap(({ amount }) => (amount > 0 ? [amount] : []))),
  ].toSorted((left, right) => left - right);

  return levels.map((level, index) => {
    const floor = levels[index - 1] ?? 0;
    let amount = 0;

    for (const ante of matched) {
      amount += Math.min(Math.max(ante.amount - floor, 0), level - floor);
    }

    return [
      amount,
      matched
        .flatMap((ante) => (ante.amount >= level ? [ante.seat] : []))
        .toSorted((left, right) => left - right),
    ];
  });
};

const stackAt = (state: TableState, index: number) => {
  const occupant = state.seats[index];

  return occupant !== undefined && Seats.$is("Occupied")(occupant)
    ? occupant.stack
    : 0;
};

const playable = (state: TableState) =>
  state.seats.flatMap((occupant, index) =>
    Seats.$is("Occupied")(occupant) &&
    !occupant.sittingOut &&
    occupant.stack > 0
      ? [index]
      : []
  );

const nextAfter = (seats: readonly number[], after: number | undefined) =>
  after === undefined
    ? seats[0]
    : (seats.find((index) => index > after) ?? seats[0]);

const rotationOf = (state: TableState) =>
  TableStates.$is("BetweenHands")(state)
    ? JSON.stringify([state.button, state.lastBlinds])
    : "";

const dueByTheRules = (state: TableState, command: Command) =>
  Commands.$is("StartHand")(command) &&
  BombPots.$match(state.config.bombPot, {
    BombPots: ({ everyHands }) =>
      command.bombPot === true ||
      (everyHands > 0 && (state.handNumber + 1) % everyHands === 0),
    NoBombPots: () => false,
  });

const BETTING = new Set([
  "BlindPosted",
  "StraddlePosted",
  "Called",
  "RaisedTo",
  "Checked",
  "Folded",
]);

type Started = Extract<Event, { readonly _tag: "HandStarted" }>;

const lastButtonOf = (before: TableState) =>
  TableStates.$is("BetweenHands")(before)
    ? Option.getOrUndefined(
        Option.orElse(before.bombButton, () => before.button)
      )
    : undefined;

const seatingProblems = (before: TableState, started: Started) => {
  const seats = playable(before);

  return JSON.stringify(started.dealtIn) === JSON.stringify(seats) &&
    started.button === nextAfter(seats, lastButtonOf(before))
    ? []
    : [
        `hand ${started.handNumber} dealt ${started.dealtIn.join(",")} with the button on ${started.button}`,
      ];
};

const expectedAntes = (before: TableState, ante: number) =>
  playable(before).map((index) => ({
    amount: Math.min(ante, stackAt(before, index)),
    seat: index,
  }));

const anteProblems = (
  before: TableState,
  started: Started,
  events: readonly Event[],
  ante: number
) => {
  const antes = events.filter(Events.$is("AntePosted"));

  const taken = antes
    .map(({ amount, seat: at }) => ({ amount, seat: at }))
    .toSorted((left, right) => left.seat - right.seat);

  const allInsMatch = antes.every(
    (posted) =>
      posted.allIn === (posted.amount === stackAt(before, posted.seat))
  );

  return JSON.stringify(taken) ===
    JSON.stringify(expectedAntes(before, ante)) && allInsMatch
    ? []
    : [`hand ${started.handNumber} took the wrong antes`];
};

const potsBuilt = (events: readonly Event[], after: TableState) => {
  if (TableStates.$is("InHand")(after)) {
    return buildPots(after.hand).map((pot) => [pot.amount, pot.eligible]);
  }

  const awards = events.filter(Events.$is("PotAwarded"));

  return [...new Set(awards.map((award) => award.pot))].map((pot) => {
    let amount = 0;

    for (const award of awards) {
      amount += award.pot === pot ? award.amount : 0;
    }

    return [amount, awards.find((award) => award.pot === pot)?.eligible ?? []];
  });
};

const potProblems = (
  before: TableState,
  started: Started,
  events: readonly Event[],
  after: TableState,
  ante: number
) => {
  const built = JSON.stringify(potsBuilt(events, after));
  const owed = JSON.stringify(potsFromAntes(expectedAntes(before, ante)));

  return built === owed
    ? []
    : [`hand ${started.handNumber} built ${built} from antes worth ${owed}`];
};

const openingProblems = (
  started: Started,
  events: readonly Event[],
  after: TableState
) => {
  const firstStreet = events.findIndex(Events.$is("StreetDealt"));
  const opening = firstStreet === -1 ? events : events.slice(0, firstStreet);

  const live = TableStates.$is("InHand")(after)
    ? after.hand.players.flatMap((dealt) =>
        dealt.status === "Active" ? [dealt.seat] : []
      )
    : [];

  const opensWrong =
    TableStates.$is("InHand")(after) &&
    Phases.$is("Betting")(after.hand.phase) &&
    after.hand.phase.toAct !== nextAfter(live, started.button);

  return [
    ...(opening.some((event) => BETTING.has(event._tag))
      ? [`hand ${started.handNumber} bet before its flop`]
      : []),
    ...(opensWrong
      ? [`hand ${started.handNumber} opened on the wrong seat`]
      : []),
  ];
};

const DEALS = new Set([
  "StreetDealt",
  "RunsAgreed",
  "RunsChosen",
  "HandsTabled",
  "ShowdownReached",
]);

const flopProblems = (hand: readonly Event[]) => {
  const [opened] = hand;
  const [first, ...later] = hand.filter((event) => DEALS.has(event._tag));

  if (
    opened === undefined ||
    !Events.$is("HandStarted")(opened) ||
    opened.bombPot === undefined ||
    first === undefined
  ) {
    return [];
  }

  const oneFlopFirst =
    Events.$is("StreetDealt")(first) &&
    first.street === "Flop" &&
    first.cards.length === 3 &&
    !later.some(
      (event) => Events.$is("StreetDealt")(event) && event.street === "Flop"
    );

  return oneFlopFirst
    ? []
    : [
        `hand ${opened.handNumber} did not deal its one flop before everything else`,
      ];
};

const rotationProblems = (source: Session) => {
  const problems: string[] = [];
  let rotation = "";
  let bombButton: number | undefined;

  playSession(source, (state, event) => {
    if (Events.$is("HandStarted")(event)) {
      bombButton = event.bombPot === undefined ? undefined : event.button;
    }

    if (
      Events.$is("HandEnded")(event) &&
      TableStates.$is("BetweenHands")(state)
    ) {
      if (bombButton !== undefined && rotationOf(state) !== rotation) {
        problems.push(`hand ${event.handNumber} moved the blinds`);
      }

      if (Option.getOrUndefined(state.bombButton) !== bombButton) {
        problems.push(`hand ${event.handNumber} lost its button`);
      }
    }

    if (TableStates.$is("BetweenHands")(state)) {
      rotation = rotationOf(state);
    }
  });

  return problems;
};

const bombProblems = (source: Session) => {
  const problems: string[] = [];
  let bombPots = 0;
  let shortAntes = 0;
  let inARow = 0;
  let lastWasBomb = false;
  const played = playSession(source);

  for (const step of played.steps) {
    const started = startedIn(step.events);

    if (started === undefined) {
      continue;
    }

    const bomb = started.bombPot;

    if ((bomb !== undefined) !== dueByTheRules(step.before, step.command)) {
      problems.push(`hand ${started.handNumber} is the wrong kind of hand`);
    }

    inARow += bomb !== undefined && lastWasBomb ? 1 : 0;
    lastWasBomb = bomb !== undefined;

    if (bomb !== undefined) {
      bombPots += 1;
      shortAntes += expectedAntes(step.before, bomb.ante).some(
        ({ amount }) => amount < bomb.ante
      )
        ? 1
        : 0;
      problems.push(
        ...seatingProblems(step.before, started),
        ...anteProblems(step.before, started, step.events, bomb.ante),
        ...potProblems(
          step.before,
          started,
          step.events,
          step.after,
          bomb.ante
        ),
        ...openingProblems(started, step.events, step.after)
      );
    }
  }

  problems.push(
    ...handsIn(played.events).flatMap(flopProblems),
    ...rotationProblems(source)
  );

  return { bombPots, inARow, problems, shortAntes };
};

const seededSession = (seed: number): Session => {
  const random = seededRandom(seed);

  return {
    anteAmount: 1 + random.below(12),
    anteKind: random.below(3),
    bigBlindExtra: random.below(13),
    bombAnte: 12 + random.below(29),
    bombEvery: random.below(5),
    bounty: random.below(61),
    button: random.chance(1, 2),
    casinoBlinds: random.chance(1, 2),
    fixedRuns: random.chance(1, 2),
    hiddenAllIns: random.chance(1, 2),
    intents: Array.from({ length: 400 }, () => ({
      pick: random.below(1_000_000_000),
      roll: random.below(100),
    })),
    interactive: random.chance(1, 2),
    lastAggressorShows: random.chance(1, 2),
    maxRuns: 1 + random.below(4),
    rabbitHunt: random.chance(1, 2),
    rabbitStillIn: random.chance(1, 2),
    smallBlind: 1 + random.below(10),
    stacks: Array.from({ length: 9 }, () => random.below(301)),
    straddlesDouble: random.chance(1, 2),
    underTheGun: random.below(4),
    voluntaryBoth: random.chance(1, 2),
  };
};

describe("generated sessions with bomb pots", () => {
  it.prop(
    "a hand is a bomb pot exactly when the rule and the call say so; it deals in every seat with chips that is not sitting out, takes each seat's ante or all it holds, bets nothing before the flop, builds the pots those antes make, opens left of the button, and leaves the blinds where they were",
    { source: session },
    ({ source }) => {
      expect(bombProblems(source).problems).toStrictEqual([]);
    }
  );

  it("reaches bomb pots, short antes, and two in a row in seeded sessions", () => {
    let bombPots = 0;
    let shortAntes = 0;
    let inARow = 0;

    for (let seed = 1; seed <= 30; seed += 1) {
      const outcome = bombProblems(seededSession(seed));

      expect(outcome.problems).toStrictEqual([]);
      bombPots += outcome.bombPots;
      shortAntes += outcome.shortAntes;
      inARow += outcome.inARow;
    }

    expect(bombPots).toBeGreaterThan(100);
    expect(shortAntes).toBeGreaterThan(10);
    expect(inARow).toBeGreaterThan(10);
  });
});
