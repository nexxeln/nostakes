import { describe, expect, it } from "@effect/vitest";
import { Option, Result } from "effect";

import {
  Actions,
  Antes,
  Commands,
  Events,
  PendingDecisions,
  Phases,
  Seats,
  ShowdownEntries,
  TableStates,
  decide,
  evaluate,
  evolve,
  invariants,
  legalActions,
  pendingDecisions,
  replay,
} from "../src/index.js";
import type {
  Action,
  Card,
  Command,
  Event,
  LegalActions,
  SeatIndex,
  TableState,
} from "../src/index.js";
import { bankrollChange, chipCount, runCount, seat } from "./fixtures.js";
import { seededRandom } from "./random.js";
import {
  answerPending,
  configOf,
  handsIn,
  playSession,
  session,
} from "./sessions.js";

const stacksTotal = (state: TableState) =>
  state.seats.reduce(
    (total, current) =>
      total + (Seats.$is("Occupied")(current) ? current.stack : 0),
    0
  );

const chipsOnTable = (state: TableState) => {
  if (!TableStates.$is("InHand")(state)) {
    return stacksTotal(state);
  }

  const { hand } = state;

  return hand.players.reduce(
    (total, player) => total + player.committedTotal - player.won,
    stacksTotal(state) + hand.deadMoney
  );
};

const contributionOf = (event: Event) => {
  if (
    Events.$is("AntePosted")(event) ||
    Events.$is("BlindPosted")(event) ||
    Events.$is("StraddlePosted")(event) ||
    Events.$is("Called")(event)
  ) {
    return event.amount;
  }

  return Events.$is("RaisedTo")(event) ? event.added : 0;
};

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

const accepts = (state: TableState, command: Command) =>
  Result.isSuccess(decide(state, command));

const expectedToAccept = (legal: LegalActions, action: Action) =>
  Actions.$match(action, {
    Call: () => Option.isSome(legal.call),
    Check: () => legal.canCheck,
    Fold: () => true,
    RaiseTo: ({ to }) =>
      Option.exists(
        legal.raise,
        (range) => to >= range.minTo && to <= range.maxTo
      ),
  });

const candidateActions = (legal: LegalActions): readonly Action[] => {
  const raise = Option.getOrElse(legal.raise, () => ({
    maxTo: chipCount(40),
    minTo: chipCount(20),
  }));

  return [
    Actions.Fold(),
    Actions.Check(),
    Actions.Call(),
    ...[
      0,
      1,
      raise.minTo - 1,
      raise.minTo,
      raise.maxTo,
      raise.maxTo + 1,
      raise.minTo + 1,
    ].flatMap((to) =>
      to >= 0 ? [Actions.RaiseTo({ to: chipCount(to) })] : []
    ),
  ];
};

const finishHand = (
  start: TableState,
  answer: (state: TableState) => Option.Option<Command>,
  bound: number
) => {
  let state = start;
  let commands = 0;

  while (TableStates.$is("InHand")(state) && commands <= bound) {
    const command = Option.getOrThrow(answer(state));
    const decision = decide(state, command);

    if (Result.isFailure(decision)) {
      throw decision.failure;
    }

    for (const event of decision.success) {
      state = evolve(state, event);
    }

    commands += 1;
  }

  return { commands, finished: TableStates.$is("BetweenHands")(state) };
};

const passive = (state: TableState) =>
  PendingDecisions.$match(pendingDecisions(state), {
    Bet: ({ legal }) =>
      Option.some(
        Commands.Act({
          action: legal.canCheck ? Actions.Check() : Actions.Call(),
          seat: legal.seat,
        })
      ),
    ChooseRuns: ({ seats }) =>
      Option.some(
        Commands.ChooseRuns({
          runs: runCount(1),
          seat: seats[0] ?? seat(0),
        })
      ),
    Nothing: () => Option.none(),
  });

interface Dealt {
  readonly boards: ReadonlyMap<number, readonly Card[]>;
  readonly holes: ReadonlyMap<number, readonly Card[]>;
}

const dealtIn = (hand: readonly Event[]): Dealt => {
  const holes = new Map<number, readonly Card[]>();
  const shared: Card[] = [];
  const runs = new Map<number, Card[]>();
  let agreed = false;

  for (const event of hand) {
    if (Events.$is("HoleCardsDealt")(event)) {
      holes.set(event.seat, event.cards);
    }

    if (Events.$is("RunsAgreed")(event)) {
      agreed = true;
    }

    if (Events.$is("StreetDealt")(event)) {
      if (agreed) {
        runs.set(event.run, [...(runs.get(event.run) ?? []), ...event.cards]);
      } else {
        shared.push(...event.cards);
      }
    }
  }

  const boards = new Map<number, readonly Card[]>([[1, shared]]);

  for (const [run, cards] of runs) {
    boards.set(run, [...shared, ...cards]);
  }

  return { boards, holes };
};

const oddChipDistance = (button: number, seatIndex: number) =>
  (seatIndex - button + 8) % 9;

describe("generated sessions", () => {
  it.prop(
    "conserve chips: the table total moves only by buy-ins, top-ups, and cash-outs, and every state passes invariants",
    { source: session },
    ({ source }) => {
      let bankroll = 0;
      const broken: string[] = [];

      playSession(source, (state, event) => {
        bankroll += bankrollChange(event);

        if (chipsOnTable(state) !== bankroll) {
          broken.push(
            `${event._tag}: ${chipsOnTable(state)} on the table, ${bankroll} bought in`
          );
        }

        for (const found of invariants(state)) {
          broken.push(`${event._tag}: ${found.invariant} ${found.detail}`);
        }
      });

      expect(broken).toStrictEqual([]);
    }
  );

  it.prop(
    "replay: folding the emitted events from the initial table gives the same state",
    { source: session },
    ({ source }) => {
      const played = playSession(source);

      expect(replay(configOf(source), played.events)).toStrictEqual(
        played.state
      );
    }
  );

  it.prop(
    "legality: the seat to act may do exactly what legalActions lists, every other seat is refused, and a refused command changes nothing",
    { source: session },
    ({ source }) => {
      const mismatches: string[] = [];
      const played = playSession(source);

      for (const step of played.steps) {
        if (!step.accepted && step.after !== step.before) {
          mismatches.push(`refused ${step.command._tag} changed the state`);
        }

        const legal = legalActions(step.before);

        if (Option.isSome(legal)) {
          for (const action of candidateActions(legal.value)) {
            const command = Commands.Act({ action, seat: legal.value.seat });

            if (
              accepts(step.before, command) !==
              expectedToAccept(legal.value, action)
            ) {
              mismatches.push(`${action._tag} by the seat to act`);
            }

            const other = seat((legal.value.seat + 1) % 9);

            if (accepts(step.before, Commands.Act({ action, seat: other }))) {
              mismatches.push(`${action._tag} by seat ${other}`);
            }
          }
        }
      }

      expect(mismatches).toStrictEqual([]);
    }
  );

  it.prop(
    "termination: answering every pending decision ends the hand, within 45 commands when every answer is check, call, or run once",
    { source: session },
    ({ source }) => {
      const played = playSession(source);

      const inHand = played.steps
        .map((step) => step.after)
        .filter((state) => TableStates.$is("InHand")(state))
        .filter((_, index) => index % 5 === 0);

      for (const [index, state] of inHand.entries()) {
        const random = seededRandom(index + 1);

        expect(finishHand(state, passive, 45)).toMatchObject({
          finished: true,
        });
        expect(
          finishHand(state, (current) => answerPending(current, random), 2000)
        ).toMatchObject({ finished: true });
      }
    }
  );

  it.prop(
    "pots: awards plus returns equal contributions, winners are eligible, and each pot's parts across runs differ by at most a chip with the larger parts first",
    { source: session },
    ({ source }) => {
      for (const hand of handsIn(playSession(source).events)) {
        if (!hand.some(Events.$is("HandEnded"))) {
          continue;
        }

        const awards = hand.filter(Events.$is("PotAwarded"));
        const returned = hand.filter(Events.$is("UncalledBetReturned"));

        const folded = new Set(
          hand.filter(Events.$is("Folded")).map((fold) => fold.seat)
        );

        expect(
          awards.flatMap((award) =>
            award.eligible.filter((eligible) => folded.has(eligible))
          )
        ).toStrictEqual([]);

        expect(sum(hand.map(contributionOf))).toBe(
          sum(awards.map((award) => award.amount)) +
            sum(returned.map((back) => back.amount))
        );

        for (const award of awards) {
          expect(
            award.winners.every((winner) =>
              award.eligible.includes(winner.seat)
            )
          ).toBe(true);
          expect(sum(award.winners.map((winner) => winner.amount))).toBe(
            award.amount
          );
        }

        const pots = new Set(awards.map((award) => award.pot));

        for (const pot of pots) {
          const parts = awards
            .filter((award) => award.pot === pot)
            .toSorted((left, right) => left.run - right.run)
            .map((award) => award.amount);

          expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(
            1
          );
          expect(parts).toStrictEqual(
            parts.toSorted((left, right) => right - left)
          );
        }
      }
    }
  );

  it.prop(
    "showdown: in every pot part the winners are exactly the best eligible hands on that run's board, shares fall by at most a chip from the seat after the button, and a seat shows only when rule 24 says so",
    { source: session },
    ({ source }) => {
      for (const hand of handsIn(playSession(source).events)) {
        const started = hand.find(Events.$is("HandStarted"));
        const showdowns = hand.filter(Events.$is("ShowdownReached"));

        if (started === undefined || showdowns.length === 0) {
          continue;
        }

        const { boards, holes } = dealtIn(hand);
        const tabled = hand.some(Events.$is("HandsTabled"));

        const rankOn = (run: number, seatIndex: number) =>
          evaluate([
            ...(holes.get(seatIndex) ?? []),
            ...(boards.get(run) ?? []),
          ]);

        for (const award of hand.filter(Events.$is("PotAwarded"))) {
          const best = Math.max(
            ...award.eligible.map((seatIndex) => rankOn(award.run, seatIndex))
          );

          const ordered = award.winners.toSorted(
            (left, right) =>
              oddChipDistance(started.button, left.seat) -
              oddChipDistance(started.button, right.seat)
          );

          expect(
            award.winners
              .map((winner) => winner.seat)
              .toSorted((left, right) => left - right)
          ).toStrictEqual(
            award.eligible
              .filter((seatIndex) => rankOn(award.run, seatIndex) === best)
              .toSorted((left, right) => left - right)
          );
          expect(ordered.map((winner) => winner.amount)).toStrictEqual(
            ordered.map((winner) => winner.amount).toSorted((l, r) => r - l)
          );
          expect(
            Math.max(...ordered.map((winner) => winner.amount)) -
              Math.min(...ordered.map((winner) => winner.amount))
          ).toBeLessThanOrEqual(1);
        }

        for (const showdown of showdowns) {
          const pots = hand
            .filter(Events.$is("PotAwarded"))
            .filter((award) => award.run === showdown.run);

          const shownSoFar: SeatIndex[] = [];

          for (const entry of showdown.order) {
            const rank = rankOn(showdown.run, entry.seat);

            const contests = pots.some(
              (pot) =>
                pot.eligible.includes(entry.seat) &&
                shownSoFar.every(
                  (other) =>
                    !pot.eligible.includes(other) ||
                    rank >= rankOn(showdown.run, other)
                )
            );

            const shouldShow = tabled || shownSoFar.length === 0 || contests;

            expect(ShowdownEntries.$is("Shown")(entry)).toBe(shouldShow);

            if (shouldShow) {
              shownSoFar.push(entry.seat);
            }

            if (ShowdownEntries.$is("Mucked")(entry)) {
              expect(
                pots.some((pot) =>
                  pot.winners.some((winner) => winner.seat === entry.seat)
                )
              ).toBe(false);
            }
          }
        }
      }
    }
  );

  it.prop(
    "secrecy: hole cards become public only through their own seat's tabling, showing, or voluntary show, and every board card follows the deck order",
    { source: session },
    ({ source }) => {
      for (const hand of handsIn(playSession(source).events)) {
        const started = hand.find(Events.$is("HandStarted"));

        if (started === undefined) {
          continue;
        }

        const seats = hand.filter(Events.$is("HoleCardsDealt"));
        const count = seats.length;

        for (const [index, dealt] of seats.entries()) {
          expect(dealt.cards).toStrictEqual([
            started.deck[index],
            started.deck[count + index],
          ]);
        }

        const holes = new Map(seats.map((dealt) => [dealt.seat, dealt.cards]));
        const allHoles = new Set(seats.flatMap((dealt) => dealt.cards));

        const ownCards = (seatIndex: SeatIndex, cards: readonly Card[]) =>
          cards.every((card) => holes.get(seatIndex)?.includes(card) ?? false);

        const fromDeck = [
          ...hand
            .filter(Events.$is("StreetDealt"))
            .flatMap((dealt) => dealt.cards),
          ...hand
            .filter(Events.$is("RabbitHunted"))
            .flatMap((hunt) => hunt.cards),
        ];

        expect(fromDeck).toStrictEqual(
          started.deck.slice(2 * count, 2 * count + fromDeck.length)
        );
        expect(fromDeck.some((card) => allHoles.has(card))).toBe(false);

        const mucked = new Set(
          hand
            .filter(Events.$is("ShowdownReached"))
            .flatMap((showdown) => showdown.order)
            .filter(ShowdownEntries.$is("Mucked"))
            .map((entry) => entry.seat)
        );

        for (const event of hand) {
          if (Events.$is("HandsTabled")(event)) {
            expect(
              event.hands.every((tabled) => ownCards(tabled.seat, tabled.cards))
            ).toBe(true);
          }

          if (Events.$is("ShowdownReached")(event)) {
            for (const entry of event.order.filter(
              ShowdownEntries.$is("Shown")
            )) {
              expect(ownCards(entry.seat, entry.cards)).toBe(true);
              expect(mucked.has(entry.seat)).toBe(false);
            }
          }

          if (Events.$is("CardsShown")(event)) {
            expect(ownCards(event.seat, event.cards)).toBe(true);
          }
        }
      }
    }
  );

  it.prop(
    "forced bets: antes never count toward the bet to match, and preflop opens at the last straddle or the full big blind",
    { source: session },
    ({ source }) => {
      const broken: string[] = [];
      let posted = new Map<number, number>();
      let antes = new Map<number, number>();
      let lastStraddle = 0;

      playSession(source, (state, event) => {
        if (Events.$is("HandStarted")(event)) {
          posted = new Map();
          antes = new Map();
          lastStraddle = 0;
        }

        if (Events.$is("AntePosted")(event)) {
          antes.set(event.seat, event.amount);
        }

        if (
          Events.$is("BlindPosted")(event) ||
          Events.$is("StraddlePosted")(event)
        ) {
          posted.set(event.seat, (posted.get(event.seat) ?? 0) + event.amount);
        }

        if (Events.$is("StraddlePosted")(event)) {
          lastStraddle = event.amount;
        }

        if (
          !Events.$is("HoleCardsDealt")(event) ||
          !TableStates.$is("InHand")(state) ||
          state.hand.players.some((player) => player.holeCards.length === 0)
        ) {
          return;
        }

        const everyPlayer = Antes.$is("EveryPlayer")(state.config.ante);

        for (const player of state.hand.players) {
          const live = posted.get(player.seat) ?? 0;
          const dead = everyPlayer ? (antes.get(player.seat) ?? 0) : 0;

          if (
            player.committedThisStreet !== live ||
            player.committedTotal !== live + dead
          ) {
            broken.push(
              `seat ${player.seat} committed ${player.committedThisStreet}`
            );
          }
        }

        if (
          Phases.$is("Betting")(state.hand.phase) &&
          state.hand.phase.currentBet !==
            (lastStraddle > 0 ? lastStraddle : state.config.bigBlind)
        ) {
          broken.push(`bet to match is ${state.hand.phase.currentBet}`);
        }
      });

      expect(broken).toStrictEqual([]);
    }
  );
});
