import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import {
  Commands,
  Events,
  Seats,
  SevenDeuces,
  TableStates,
  isSevenDeuce,
} from "../src/index.js";
import type {
  Card,
  Event,
  SevenDeuce,
  TableConfig,
  TableState,
} from "../src/index.js";
import {
  baseConfig,
  calls,
  cards,
  checks,
  chipCount,
  deckStartingWith,
  folds,
  occupiedTable,
  play,
  raisesTo,
  run,
  runCount,
  seat,
  shownCards,
  stacksOf,
  startHand,
} from "./fixtures.js";
import { seededRandom } from "./random.js";
import { generated } from "./scale.js";
import { configOf, playSession, session } from "./sessions.js";
import type { Session } from "./sessions.js";

const BOUNTY = 30;

const withBounty: TableConfig = {
  ...baseConfig,
  sevenDeuce: SevenDeuces.Bounty({ amount: chipCount(BOUNTY) }),
};

const bountiesIn = (events: readonly Event[]) =>
  events.filter(Events.$is("BountyPaid"));

const paid = (collector: number, payers: Readonly<Record<number, number>>) =>
  Events.BountyPaid({
    payers: Object.entries(payers).map(([index, amount]) => ({
      amount: chipCount(amount),
      seat: seat(Number(index)),
    })),
    seat: seat(collector),
  });

const walkTo = (config: TableConfig, deckText: string) =>
  play(
    startHand(
      occupiedTable(config, { 0: 200, 1: 200, 2: 200 }),
      deckStartingWith(deckText)
    ).state,
    [
      [0, folds],
      [1, folds],
    ]
  );

const allInFor = (deckText: string) =>
  play(
    startHand(
      occupiedTable(withBounty, { 0: 200, 1: 20, 2: 200 }),
      deckStartingWith(deckText)
    ).state,
    [
      [0, raisesTo(60)],
      [1, calls],
      [2, calls],
      [2, checks],
      [0, checks],
      [2, checks],
      [0, checks],
      [2, checks],
      [0, checks],
    ]
  );

describe("seven-deuce bounty", () => {
  it("shows a seven-deuce that wins when everyone folds, and every other seat dealt in pays", () => {
    const walked = walkTo(withBounty, "Ac 7h Kc Ad 2c Kd");

    expect(walked.events.slice(-3)).toStrictEqual([
      Events.HandEnded({ handNumber: 1 }),
      Events.CardsShown({ cards: cards("7h 2c"), seat: seat(2) }),
      paid(2, { 0: BOUNTY, 1: BOUNTY }),
    ]);
    expect(stacksOf(walked.state).slice(0, 3)).toStrictEqual([170, 165, 265]);
  });

  it("counts a suited seven-deuce", () => {
    expect(
      bountiesIn(walkTo(withBounty, "Ac 7h Kc Ad 2h Kd").events)
    ).toStrictEqual([paid(2, { 0: BOUNTY, 1: BOUNTY })]);
  });

  it("pays nothing while the rule is off, and nothing for another hand", () => {
    expect(
      bountiesIn(walkTo(baseConfig, "Ac 7h Kc Ad 2c Kd").events)
    ).toStrictEqual([]);
    expect(
      bountiesIn(walkTo(withBounty, "Ac 7h Kc Ad 3c Kd").events)
    ).toStrictEqual([]);
  });

  it("does not pay for a hand that ended before the rule was on", () => {
    const walked = walkTo(baseConfig, "Ac 7h Kc Ad 2c Kd").state;

    const changed = run(
      walked,
      Commands.ChangeRules({ config: withBounty })
    ).state;

    expect(
      run(
        changed,
        Commands.ShowCards({ cards: shownCards("7h 2c"), seat: seat(2) })
      ).events
    ).toStrictEqual([
      Events.CardsShown({ cards: cards("7h 2c"), seat: seat(2) }),
    ]);
  });

  it("takes all of a stack smaller than the bounty and nothing from a seat that busted", () => {
    const table = occupiedTable(withBounty, { 0: 200, 1: 12, 2: 200 });

    const folded = play(
      startHand(table, deckStartingWith("Ac 7h Kc Ad 2c Kd")).state,
      [
        [0, folds],
        [1, folds],
      ]
    );

    expect(bountiesIn(folded.events)).toStrictEqual([
      paid(2, { 0: BOUNTY, 1: 7 }),
    ]);
    expect(stacksOf(folded.state).slice(0, 3)).toStrictEqual([170, 0, 242]);

    const busted = play(
      startHand(
        occupiedTable(withBounty, { 0: 200, 1: 10, 2: 200 }),
        deckStartingWith("Ac 7h Qc Kc 2c Qd 7d 7s 2d 9h Jh")
      ).state,
      [
        [0, folds],
        [1, calls],
      ]
    );

    expect(bountiesIn(busted.events)).toStrictEqual([paid(2, { 0: BOUNTY })]);
    expect(busted.events.some(Events.$is("CardsShown"))).toBe(false);
    expect(stacksOf(busted.state).slice(0, 3)).toStrictEqual([170, 0, 240]);
  });

  it("pays nothing for a split pot", () => {
    const split = play(
      startHand(
        occupiedTable(withBounty, { 0: 200, 1: 200, 2: 200 }),
        deckStartingWith("7d 7h Kc 2d 2c Kd As Ks Qs 9h 4d")
      ).state,
      [
        [0, folds],
        [1, calls],
        [2, checks],
        [1, checks],
        [2, checks],
        [1, checks],
        [2, checks],
        [1, checks],
        [2, checks],
      ]
    );

    expect(split.events.filter(Events.$is("PotAwarded"))).toHaveLength(1);
    expect(bountiesIn(split.events)).toStrictEqual([]);
  });

  it("pays nothing for a side pot won while the main pot is lost, and pays a short stack that wins the main pot alone", () => {
    const sideOnly = allInFor("7d 7h Ac 7s 2c Kd 7c 2s 9h Jd 4s");

    expect(
      sideOnly.events
        .filter(Events.$is("PotAwarded"))
        .map((award) => award.winners.map((winner) => winner.seat))
    ).toStrictEqual([[seat(1)], [seat(2)]]);
    expect(bountiesIn(sideOnly.events)).toStrictEqual([]);

    const mainOnly = allInFor("7h Ac Kd 2c Qc Qd 7c 2s 9h Jd 4s");

    expect(
      mainOnly.events
        .filter(Events.$is("PotAwarded"))
        .map((award) => award.winners.map((winner) => winner.seat))
    ).toStrictEqual([[seat(1)], [seat(2)]]);
    expect(bountiesIn(mainOnly.events)).toStrictEqual([
      paid(1, { 0: BOUNTY, 2: BOUNTY }),
    ]);
  });

  it("pays nothing when the board runs twice and one run is lost", () => {
    const twice: TableConfig = { ...withBounty, maxRuns: runCount(2) };

    const ran = play(
      startHand(
        occupiedTable(twice, { 0: 200, 1: 300 }),
        deckStartingWith("Ac 7h Kd 2c 7d 2s 9h Jd 4s As Ks 3d 5h 8c")
      ).state,
      [
        [0, raisesTo(200)],
        [1, calls],
      ]
    );

    const chosen = run(
      run(ran.state, Commands.ChooseRuns({ runs: runCount(2), seat: seat(0) }))
        .state,
      Commands.ChooseRuns({ runs: runCount(2), seat: seat(1) })
    );

    expect(
      chosen.events
        .filter(Events.$is("PotAwarded"))
        .map((award) => award.winners.map((winner) => winner.seat))
    ).toStrictEqual([[seat(0)], [seat(1)]]);
    expect(bountiesIn(chosen.events)).toStrictEqual([]);
  });
});

const RANKS_OF_SEVEN_DEUCE = [0, 5];

const sevenAndDeuce = (hole: readonly Card[]) =>
  hole.length === 2 &&
  RANKS_OF_SEVEN_DEUCE.every((rank) =>
    hole.some((held) => Math.floor(held / 4) === rank)
  );

interface Watched {
  readonly awards: readonly {
    readonly eligible: readonly number[];
    readonly winners: readonly number[];
  }[];
  readonly bombPot: boolean;
  readonly dealt: readonly number[];
  readonly holes: ReadonlyMap<number, readonly Card[]>;
  readonly rule: SevenDeuce;
}

const stackAt = (state: TableState, index: number) => {
  const occupant = state.seats[index];

  return occupant !== undefined && Seats.$is("Occupied")(occupant)
    ? occupant.stack
    : 0;
};

const expectedBounty = (hand: Watched, ended: TableState) => {
  const collectors = hand.dealt.filter((index) => {
    const contested = hand.awards.filter((award) =>
      award.eligible.includes(index)
    );

    return (
      sevenAndDeuce(hand.holes.get(index) ?? []) &&
      contested.length > 0 &&
      contested.every(
        (award) => award.winners.length === 1 && award.winners[0] === index
      )
    );
  });

  const [collector] = collectors;

  if (
    collector === undefined ||
    hand.bombPot ||
    SevenDeuces.$is("NoBounty")(hand.rule)
  ) {
    return { collectors, payers: [] };
  }

  const { amount } = hand.rule;

  return {
    collectors,
    payers: hand.dealt.flatMap((index) => {
      const owed = Math.min(amount, stackAt(ended, index));

      return index !== collector && owed > 0
        ? [{ amount: owed, seat: index }]
        : [];
    }),
  };
};

const bountyProblems = (source: Session) => {
  const problems: string[] = [];
  let rule = configOf(source).sevenDeuce;
  let bounties = 0;

  let hand: Watched = {
    awards: [],
    bombPot: false,
    dealt: [],
    holes: new Map(),
    rule,
  };

  let due: Option.Option<{
    readonly collector: number;
    readonly ended: TableState;
    readonly payers: readonly { amount: number; seat: number }[];
  }> = Option.none();

  playSession(source, (state, event) => {
    if (Events.$is("RulesChanged")(event)) {
      rule = event.config.sevenDeuce;
    }

    if (Events.$is("HandStarted")(event)) {
      hand = {
        awards: [],
        bombPot: event.bombPot !== undefined,
        dealt: event.dealtIn,
        holes: new Map(),
        rule,
      };
    }

    if (Events.$is("HoleCardsDealt")(event)) {
      hand = {
        ...hand,
        holes: new Map([...hand.holes, [event.seat, event.cards]]),
      };
    }

    if (Events.$is("PotAwarded")(event)) {
      hand = {
        ...hand,
        awards: [
          ...hand.awards,
          {
            eligible: event.eligible,
            winners: event.winners.map((winner) => winner.seat),
          },
        ],
      };
    }

    if (Events.$is("BountyPaid")(event)) {
      bounties += 1;

      Option.match(due, {
        onNone: () => {
          problems.push(`a bounty nobody was owed went to seat ${event.seat}`);
        },
        onSome: ({ collector, ended, payers }) => {
          if (
            event.seat !== collector ||
            JSON.stringify(event.payers) !== JSON.stringify(payers)
          ) {
            problems.push(
              `paid ${JSON.stringify(event)}, expected ${JSON.stringify(payers)} to seat ${collector}`
            );
          }

          let collected = 0;

          for (const payer of event.payers) {
            collected += payer.amount;

            if (stackAt(state, payer.seat) < 0) {
              problems.push(`seat ${payer.seat} paid more than it held`);
            }
          }

          for (const index of state.seats.keys()) {
            const moved = stackAt(state, index) - stackAt(ended, index);

            const owed =
              (index === collector ? collected : 0) -
              (event.payers.find((payer) => payer.seat === index)?.amount ?? 0);

            if (moved !== owed) {
              problems.push(
                `seat ${index} moved ${moved}, the bounty moves ${owed}`
              );
            }
          }

          const shown = TableStates.$is("BetweenHands")(state)
            ? Option.getOrUndefined(state.lastHand)?.players.find(
                (dealt) => dealt.seat === collector
              )
            : undefined;

          if (
            shown === undefined ||
            !isSevenDeuce(shown.publicCards) ||
            Option.isSome(
              TableStates.$is("BetweenHands")(state)
                ? state.lastHand.pipe(Option.flatMap((last) => last.bounty))
                : Option.none()
            )
          ) {
            problems.push(`seat ${collector} was paid without showing`);
          }
        },
      });

      due = Option.none();

      return;
    }

    if (Option.isSome(due) && !Events.$is("CardsShown")(event)) {
      problems.push(
        `seat ${due.value.collector} was owed a bounty, then ${event._tag}`
      );
      due = Option.none();
    }

    if (Events.$is("HandEnded")(event)) {
      const { collectors, payers } = expectedBounty(hand, state);
      const [collector] = collectors;

      if (collectors.length > 1) {
        problems.push(`seats ${collectors.join(",")} both won everything`);
      }

      due =
        collector !== undefined && payers.length > 0
          ? Option.some({ collector, ended: state, payers })
          : Option.none();
    }
  });

  if (Option.isSome(due)) {
    problems.push(`seat ${due.value.collector} was never paid`);
  }

  return { bounties, problems };
};

const seededSession = (seed: number): Session => {
  const random = seededRandom(seed);

  return {
    anteAmount: 1 + random.below(12),
    anteKind: random.below(3),
    bigBlindExtra: random.below(13),
    bombAnte: 0,
    bombEvery: 0,
    bounty: 20 + random.below(41),
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

describe("generated sessions with the bounty", () => {
  it.prop(
    "a bounty is paid exactly when a seven-deuce wins alone every pot it was in, as the hand ends, by every other dealt-in seat, each paying the amount or all it holds, and it moves no other chip",
    { source: session },
    ({ source }) => {
      expect(bountyProblems(source).problems).toStrictEqual([]);
    },
    generated(25, 100)
  );

  it("reaches bounties in seeded sessions", () => {
    let bounties = 0;

    for (let seed = 1; seed <= 40; seed += 1) {
      const outcome = bountyProblems(seededSession(seed));

      expect(outcome.problems).toStrictEqual([]);
      bounties += outcome.bounties;
    }

    expect(bounties).toBeGreaterThan(20);
  });
});
