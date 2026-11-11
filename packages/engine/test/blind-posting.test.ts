import { describe, expect, it } from "@effect/vitest";
import { Option, Result, Schema } from "effect";

import {
  Actions,
  Commands,
  Events,
  NO_DEBT,
  PendingDecisions,
  Seats,
  StraddleNotAllowed,
  TableStates,
  decide,
  legalActions,
  pendingDecisions,
} from "../src/index.js";
import type { Command, Event, TableConfig, TableState } from "../src/index.js";
import { NO_ORBITS, dealProblems, orbitsAfter } from "./blind-checks.js";
import {
  baseConfig,
  calls,
  chipCount,
  deckStartingWith,
  fold as evolved,
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
  startHand,
} from "./fixtures.js";
import { seededRandom } from "./random.js";
import { sized } from "./scale.js";
import { shuffledDeck } from "./sessions.js";

const casino: TableConfig = { ...baseConfig, blindPosting: "Casino" };

const deck = deckStartingWith("2c 3c 4c 5c 6c 7c 8c 9c Tc Jc Qc Kc");

const foldedOut = (state: TableState) => {
  let current = state;

  for (let guard = 0; guard < 12; guard += 1) {
    const legal = legalActions(current);

    if (Option.isNone(legal)) {
      return current;
    }

    current = run(
      current,
      Commands.Act({ action: folds, seat: legal.value.seat })
    ).state;
  }

  return current;
};

const handOne = (config: TableConfig, seats: readonly number[]) =>
  foldedOut(
    startHand(
      occupiedTable(
        config,
        Object.fromEntries(seats.map((index) => [index, 200]))
      ),
      deck
    ).state
  );

const sit = (state: TableState, index: number) =>
  run(
    state,
    Commands.SitDown({
      buyIn: chipCount(200),
      player: player(`p${index}`),
      seat: seat(index),
    })
  ).state;

const sittingOut = (state: TableState, index: number, out: boolean) =>
  run(state, Commands.SetSittingOut({ seat: seat(index), sittingOut: out }))
    .state;

const started = (events: readonly Event[]) =>
  events.find(Events.$is("HandStarted"));

const owesAt = (state: TableState, index: number) => {
  const held = state.seats[index];

  return held !== undefined && Seats.$is("Occupied")(held)
    ? held.owes
    : NO_DEBT;
};

const nextHand = (state: TableState, posting: readonly number[] = []) =>
  run(
    state,
    Commands.StartHand({
      deck,
      posts: posting.map((index) => seat(index)),
      straddles: [],
    })
  );

const posted = (events: readonly Event[]) =>
  events.filter(
    (event) =>
      Events.$is("BlindPosted")(event) &&
      (event.dead === true || event.seat !== started(events)?.bigBlindSeat) &&
      event.seat !== started(events)?.smallBlindSeat
  );

describe("casino blinds for a player who sits out", () => {
  it("forgives every debt when fewer than two seats owe nothing, so the table still deals", () => {
    const away = sittingOut(handOne(casino, [0, 2, 4, 6]), 6, true);
    const missed = foldedOut(nextHand(away).state);

    expect(owesAt(missed, 6)).toStrictEqual({
      ...NO_DEBT,
      big: true,
      small: true,
    });

    const emptied = runAll(missed, [
      Commands.StandUp({ seat: seat(2) }),
      Commands.StandUp({ seat: seat(4) }),
      Commands.SetSittingOut({ seat: seat(6), sittingOut: false }),
    ]).state;

    const dealt = nextHand(emptied);

    expect(started(dealt.events)?.dealtIn).toStrictEqual([seat(0), seat(6)]);
    expect(posted(dealt.events)).toStrictEqual([]);
    expect(owesAt(dealt.state, 6)).toStrictEqual(NO_DEBT);
  });
});

describe("the casino dead button", () => {
  it("moves the big blind one seat when the big blind leaves, leaving a dead small blind and then a dead button", () => {
    const first = handOne(casino, [0, 2, 4, 6]);
    const left = run(first, Commands.StandUp({ seat: seat(4) })).state;
    const second = nextHand(left);

    expect(started(second.events)).toMatchObject({
      bigBlindSeat: seat(6),
      button: seat(2),
      smallBlindSeat: seat(4),
    });

    const third = nextHand(foldedOut(second.state));

    expect(started(third.events)).toMatchObject({
      bigBlindSeat: seat(0),
      button: seat(4),
      dealtIn: [seat(0), seat(2), seat(6)],
      smallBlindSeat: seat(6),
    });

    const home = nextHand(
      run(
        handOne(baseConfig, [0, 2, 4, 6]),
        Commands.StandUp({ seat: seat(4) })
      ).state
    );

    expect(started(home.events)).toMatchObject({
      bigBlindSeat: seat(0),
      button: seat(2),
      smallBlindSeat: seat(6),
    });
  });
});

describe("casino heads-up", () => {
  it("gives the button to the seat that had the big blind most recently when the table goes heads-up", () => {
    const first = handOne(casino, [0, 2, 4]);

    expect(stacksOf(first).slice(0, 5)).toStrictEqual([
      200,
      null,
      195,
      null,
      205,
    ]);

    const leaving = run(first, Commands.StandUp({ seat: seat(0) })).state;
    const headsUp = nextHand(leaving);

    expect(started(headsUp.events)).toMatchObject({
      bigBlindSeat: seat(2),
      button: seat(4),
      smallBlindSeat: seat(4),
    });

    const home = nextHand(
      run(handOne(baseConfig, [0, 2, 4]), Commands.StandUp({ seat: seat(0) }))
        .state
    );

    expect(started(home.events)).toMatchObject({
      bigBlindSeat: seat(4),
      button: seat(2),
    });
  });
});

const acesBeatSevenDeuce = deckStartingWith("7c Ah 2d As Kd Qc Jh 9s 4c");

describe("the casino big blind after a heads-up hand", () => {
  it("moves on one seat when two seats that busted come back at once, and last hand's big blind takes the small blind and keeps the button", () => {
    const first = play(
      startHand(occupiedTable(casino, { 1: 2000, 5: 50 }), acesBeatSevenDeuce)
        .state,
      [
        [1, raisesTo(2000)],
        [5, calls],
      ]
    ).state;

    const second = play(
      startHand(
        run(
          first,
          Commands.SitDown({
            buyIn: chipCount(99),
            player: player("p0"),
            seat: seat(0),
          })
        ).state,
        acesBeatSevenDeuce
      ).state,
      [
        [1, raisesTo(2050)],
        [0, calls],
      ]
    ).state;

    expect(stacksOf(second).slice(0, 6)).toStrictEqual([
      0,
      2149,
      null,
      null,
      null,
      0,
    ]);

    const headsUp = nextHand(sit(second, 4));

    expect(started(headsUp.events)).toMatchObject({
      bigBlindSeat: seat(1),
      button: seat(4),
      dealtIn: [seat(1), seat(4)],
      smallBlindSeat: seat(4),
    });

    const back = runAll(foldedOut(headsUp.state), [
      Commands.AddChips({ amount: chipCount(200), seat: seat(0) }),
      Commands.AddChips({ amount: chipCount(200), seat: seat(5) }),
    ]).state;

    expect([0, 5].map((index) => owesAt(back, index))).toStrictEqual([
      NO_DEBT,
      NO_DEBT,
    ]);
    const grown = nextHand(back);

    expect(started(grown.events)).toMatchObject({
      bigBlindSeat: seat(4),
      button: seat(1),
      dealtIn: [seat(0), seat(1), seat(4), seat(5)],
      smallBlindSeat: seat(1),
    });
    expect(
      legalActions(grown.state).pipe(Option.map(({ seat: at }) => at))
    ).toStrictEqual(Option.some(seat(5)));
    expect(
      rejection(
        back,
        Commands.StartHand({
          deck,
          posts: [],
          straddles: [seat(5)],
        })
      )
    ).toStrictEqual(
      new StraddleNotAllowed({ reason: "HeadsUp", straddles: [seat(5)] })
    );
    expect(started(nextHand(foldedOut(grown.state)).events)).toMatchObject({
      bigBlindSeat: seat(5),
      button: seat(1),
      smallBlindSeat: seat(4),
    });
  });

  it("does not hand the button back to a seat that held it, busted, and comes back to a heads-up table", () => {
    const first = play(
      startHand(
        occupiedTable(casino, { 1: 60, 2: 60, 3: 60, 4: 2000, 5: 200 }),
        deckStartingWith("7c 8c Ah Kc 7d 2d 3d As Qd 2h Kd Qc Jh 9s 4c")
      ).state,
      [
        [4, raisesTo(60)],
        [5, folds],
        [1, calls],
        [2, calls],
        [3, calls],
      ]
    );

    expect(started(first.events)?.button ?? seat(1)).toBe(seat(1));
    expect(stacksOf(first.state).slice(1, 6)).toStrictEqual([
      0, 0, 0, 2180, 200,
    ]);

    const headsUp = nextHand(first.state);

    expect(started(headsUp.events)).toMatchObject({
      bigBlindSeat: seat(4),
      button: seat(5),
      dealtIn: [seat(4), seat(5)],
    });

    const back = run(
      foldedOut(headsUp.state),
      Commands.AddChips({ amount: chipCount(200), seat: seat(1) })
    ).state;

    const grown = nextHand(back);

    expect(owesAt(back, 1)).toStrictEqual(NO_DEBT);
    expect(started(grown.events)).toMatchObject({
      bigBlindSeat: seat(5),
      button: seat(4),
      dealtIn: [seat(1), seat(4), seat(5)],
      smallBlindSeat: seat(4),
    });
    expect(started(nextHand(foldedOut(grown.state)).events)).toMatchObject({
      bigBlindSeat: seat(1),
      button: seat(4),
      smallBlindSeat: seat(5),
    });
  });
});

const stackAt = (state: TableState, index: number) => {
  const held = state.seats[index];

  return held !== undefined && Seats.$is("Occupied")(held) ? held.stack : -1;
};

const answered = (state: TableState, shove: boolean): Option.Option<Command> =>
  PendingDecisions.$match(pendingDecisions(state), {
    Bet: ({ legal }) =>
      Option.some(
        Commands.Act({
          action: shove
            ? Option.match(legal.raise, {
                onNone: () =>
                  legal.canCheck ? Actions.Check() : Actions.Call(),
                onSome: (range) => Actions.RaiseTo({ to: range.maxTo }),
              })
            : Actions.Fold(),
          seat: legal.seat,
        })
      ),
    ChooseRuns: ({ seats }) =>
      Option.some(
        Commands.ChooseRuns({ runs: runCount(1), seat: seats[0] ?? seat(0) })
      ),
    Nothing: () => Option.none(),
    Show: ({ choices }) =>
      Option.some(Commands.TableHand({ seat: choices.seat })),
  });

const applied = (state: TableState, command: Command) => {
  const decision = decide(state, command);

  return Result.isSuccess(decision)
    ? { events: decision.success, state: evolved(state, decision.success) }
    : { events: [], state };
};

const COMEBACK_HANDS = 40;

const SEEDED_TABLES = sized(150, 800);

const SWEEP_TIMEOUT_MS = 120_000;

const comebackProblems = (seed: number) => {
  const random = seededRandom(seed);
  const crowd = random.chance(1, 3) ? 2 : 1;

  const seats = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(() =>
    random.chance(crowd, 3)
  );

  const problems: string[] = [];
  let afterHeadsUp = 0;
  let orbits = NO_ORBITS;

  let state = occupiedTable(
    casino,
    Object.fromEntries(
      (seats.length < 3 ? [0, 3, 6] : seats).map((index) => [
        index,
        20 + random.below(200),
      ])
    )
  );

  const rebuys = (current: TableState, share: number, least: number) => {
    let next = current;

    const playable = () =>
      next.seats.filter((held) => Seats.$is("Occupied")(held) && held.stack > 0)
        .length;

    for (const index of next.seats.keys()) {
      if (
        stackAt(next, index) === 0 &&
        (playable() < least || random.below(100) < share)
      ) {
        next = applied(
          next,
          Commands.AddChips({
            amount: chipCount(20 + random.below(200)),
            seat: seat(index),
          })
        ).state;
      }
    }

    return next;
  };

  for (let hand = 0; hand < COMEBACK_HANDS; hand += 1) {
    state = rebuys(state, 35, 2);

    const before = state;

    const lastDealt = TableStates.$is("BetweenHands")(before)
      ? Option.getOrUndefined(before.lastHand)?.players.length
      : undefined;

    const dealt = applied(
      before,
      Commands.StartHand({
        deck: shuffledDeck(random),
        posts: [],
        straddles: [],
      })
    );

    ({ state } = dealt);

    const orbit = orbitsAfter(orbits, before, dealt.events);

    ({ orbits } = orbit);

    const found = [
      ...dealProblems(before, dealt.events, state),
      ...orbit.problems,
    ];

    afterHeadsUp +=
      lastDealt === 2 && (started(dealt.events)?.dealtIn.length ?? 0) > 2
        ? 1
        : 0;

    if (found.length > 0) {
      problems.push(`seed ${seed} hand ${hand + 1}: ${found.join("; ")}`);
    }

    const shove = random.chance(3, 5);

    for (let turn = 0; turn < 60; turn += 1) {
      const command = answered(state, shove);

      if (Option.isNone(command)) {
        break;
      }

      ({ state } = applied(state, command.value));

      if (turn === 0 && TableStates.$is("InHand")(state)) {
        state = rebuys(state, 50, 0);
      }
    }
  }

  return { afterHeadsUp, problems };
};

const tableSeed = Schema.Int.check(
  Schema.isBetween({ maximum: 2_000_000_000, minimum: 1 })
);

describe("generated tables where seats bust and come back", () => {
  it.prop(
    "the big blind moves on one seat, no seat pays it twice in a row, it skips no seat that stayed, and no seat holds the button twice without paying a blind in between, however many seats come back after a heads-up hand",
    { seed: tableSeed },
    ({ seed }) => {
      expect(comebackProblems(seed).problems).toStrictEqual([]);
    }
  );

  it(
    "holds over a fixed set of seeded tables, which reach tables that grow after a heads-up hand and seats that come back having last held the button",
    () => {
      let afterHeadsUp = 0;
      const problems: string[] = [];

      for (let seed = 1; seed <= SEEDED_TABLES; seed += 1) {
        const outcome = comebackProblems(seed);

        afterHeadsUp += outcome.afterHeadsUp;
        problems.push(...outcome.problems);
      }

      expect(problems.slice(0, 5)).toStrictEqual([]);
      expect(afterHeadsUp).toBeGreaterThan(600);
    },
    SWEEP_TIMEOUT_MS
  );
});
