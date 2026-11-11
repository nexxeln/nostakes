import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import {
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
  chipCount,
  deckStartingWith,
  folds,
  occupiedTable,
  play,
  raisesTo,
  rejection,
  run,
  runAll,
  runCount,
  seat,
} from "./fixtures.js";
import { seededRandom } from "./random.js";
import { generated } from "./scale.js";
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

const tags = (events: readonly Event[]) => events.map((event) => event._tag);

const startedIn = (events: readonly Event[]) =>
  events.find(Events.$is("HandStarted"));

describe("a bomb pot", () => {
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
    },
    generated(25, 100)
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
