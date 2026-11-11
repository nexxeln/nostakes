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
  SevenDeuce,
  TableConfig,
  TableState,
} from "../src/index.js";
import {
  baseConfig,
  cards,
  chipCount,
  deckStartingWith,
  folds,
  occupiedTable,
  play,
  run,
  seat,
  shownCards,
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

describe("seven-deuce bounty", () => {
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
