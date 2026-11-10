import { describe, expect, it } from "@effect/vitest";
import { Match, Option, Result } from "effect";

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
  buildPots,
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
  ShowdownOrder,
  TableState,
} from "../src/index.js";
import { dealProblems } from "./blind-checks.js";
import { bankrollChange, chipCount, runCount, seat } from "./fixtures.js";
import { seededRandom } from "./random.js";
import {
  answerPending,
  configOf,
  handsIn,
  playSession,
  session,
} from "./sessions.js";
import {
  claimsAfterChoices,
  mustTable,
  replayShowdown,
} from "./showdown-oracle.js";

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

const livePost = (event: Event) =>
  (Events.$is("BlindPosted")(event) && event.dead !== true) ||
  Events.$is("StraddlePosted")(event)
    ? { amount: event.amount, seat: event.seat }
    : undefined;

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
    Show: ({ choices }) =>
      Option.some(Commands.TableHand({ seat: choices.seat })),
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

const cardsMadePublic = (event: Event): readonly Card[] => {
  if (
    Events.$is("StreetDealt")(event) ||
    Events.$is("CardsShown")(event) ||
    Events.$is("HandTabled")(event) ||
    Events.$is("RabbitHunted")(event)
  ) {
    return event.cards;
  }

  if (Events.$is("HandsTabled")(event)) {
    return event.hands.flatMap((tabled) => tabled.cards);
  }

  return Events.$is("ShowdownReached")(event)
    ? event.order.flatMap((entry) =>
        ShowdownEntries.$is("Shown")(entry) ? entry.cards : []
      )
    : [];
};

const oddChipDistance = (button: number, seatIndex: number) =>
  (seatIndex - button + 8) % 9;

interface OrderWatch {
  readonly button: number;
  readonly dealt: readonly number[];
  readonly folded: ReadonlySet<number>;
  readonly handOrder: ShowdownOrder;
  readonly lastRaise: number;
  readonly onRiver: boolean;
  readonly order: ShowdownOrder;
  readonly riverRaise: number;
  readonly wrong: readonly string[];
}

const newOrderWatch = (order: ShowdownOrder): OrderWatch => ({
  button: -1,
  dealt: [],
  folded: new Set(),
  handOrder: order,
  lastRaise: -1,
  onRiver: false,
  order,
  riverRaise: -1,
  wrong: [],
});

const firstShown = (event: Event): number | undefined => {
  if (Events.$is("ShowdownStarted")(event)) {
    return event.order[0];
  }

  return Events.$is("ShowdownReached")(event) && event.run === 1
    ? event.order[0]?.seat
    : undefined;
};

const expectedFirst = (watch: OrderWatch) => {
  const contenders = [
    ...watch.dealt.filter((seatIndex) => seatIndex > watch.button),
    ...watch.dealt.filter((seatIndex) => seatIndex <= watch.button),
  ].filter((seatIndex) => !watch.folded.has(seatIndex));

  const aggressor =
    watch.handOrder === "LastAggressor" ? watch.lastRaise : watch.riverRaise;

  return contenders.includes(aggressor) ? aggressor : contenders[0];
};

const watchOrder = (watch: OrderWatch, event: Event): OrderWatch => {
  const first = firstShown(event);

  if (first !== undefined) {
    const expected = expectedFirst(watch);

    return first === expected
      ? watch
      : {
          ...watch,
          wrong: [
            ...watch.wrong,
            `${watch.handOrder}: ${first} showed first, expected ${expected}`,
          ],
        };
  }

  return Match.value(event).pipe(
    Match.tag("RulesChanged", ({ config }) => ({
      ...watch,
      order: config.showdownOrder,
    })),
    Match.tag("HandStarted", (started) => ({
      ...newOrderWatch(watch.order),
      button: started.button,
      dealt: started.dealtIn,
      wrong: watch.wrong,
    })),
    Match.tag("Folded", ({ seat: folded }) => ({
      ...watch,
      folded: new Set([...watch.folded, folded]),
    })),
    Match.tag("StreetDealt", ({ street }) => ({
      ...watch,
      onRiver: watch.onRiver || street === "River",
    })),
    Match.tag("RaisedTo", ({ seat: raiser }) => ({
      ...watch,
      lastRaise: raiser,
      riverRaise: watch.onRiver ? raiser : watch.riverRaise,
    })),
    Match.orElse(() => watch)
  );
};

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
    "termination: answering every pending decision ends the hand, within 54 commands when every answer is check, call, table, or run once",
    { source: session },
    ({ source }) => {
      const played = playSession(source);

      const inHand = played.steps
        .map((step) => step.after)
        .filter((state) => TableStates.$is("InHand")(state))
        .filter((_, index) => index % 5 === 0);

      for (const [index, state] of inHand.entries()) {
        const random = seededRandom(index + 1);

        expect(finishHand(state, passive, 54)).toMatchObject({
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
    "showdown: in every pot part the winners are exactly the best eligible hands on that run's board, shares fall by at most a chip from the seat after the button, and a seat shows only when rule 24 says so, on every run when it can win or tie part of a pot on any run of a hidden run-out",
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

        const potsOn = (run: number) =>
          hand
            .filter(Events.$is("PotAwarded"))
            .filter((award) => award.run === run);

        const shownSeats: SeatIndex[] = [];

        for (const { seat: seatIndex } of showdowns[0]?.order ?? []) {
          const contests = showdowns.some(({ run }) =>
            potsOn(run).some(
              (pot) =>
                pot.eligible.includes(seatIndex) &&
                shownSeats.every(
                  (other) =>
                    !pot.eligible.includes(other) ||
                    rankOn(run, seatIndex) >= rankOn(run, other)
                )
            )
          );

          if (tabled || shownSeats.length === 0 || contests) {
            shownSeats.push(seatIndex);
          }
        }

        for (const showdown of showdowns) {
          for (const entry of showdown.order) {
            expect(ShowdownEntries.$is("Shown")(entry)).toBe(
              shownSeats.includes(entry.seat)
            );

            if (ShowdownEntries.$is("Mucked")(entry)) {
              expect(
                potsOn(showdown.run).some((pot) =>
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
    "showdown order: the first seat to show is the last seat to bet or raise, on the river or on any street as the rules say, when it is still in, and otherwise the first seat still in after the button",
    { source: session },
    ({ source }) => {
      let watch = newOrderWatch(configOf(source).showdownOrder);

      for (const event of playSession(source).events) {
        watch = watchOrder(watch, event);
      }

      expect(watch.wrong).toStrictEqual([]);
    }
  );

  it.prop(
    "casino blinds: a seat dealt in owed nothing, is the big blind, or posted exactly what it owed, never from the button or the small blind, and a seat sitting out owes every blind that passes it",
    { source: session },
    ({ source }) => {
      expect(
        playSession(source).steps.flatMap((step) =>
          dealProblems(step.before, step.events, step.after)
        )
      ).toStrictEqual([]);
    }
  );

  it.prop(
    "interactive showdown: seats are asked in order only while another seat contests a pot they claim, a muck never throws away a hand that beats or ties the tabled hands of a contested pot, and each pot is awarded once, to its last claimant or the best tabled claimants",
    { source: session },
    ({ source }) => {
      const problems: string[] = [];

      for (const hand of handsIn(playSession(source).events)) {
        if (hand.some(Events.$is("HandEnded"))) {
          problems.push(...replayShowdown(hand).problems);
        }
      }

      expect(problems).toStrictEqual([]);
    }
  );

  it.prop(
    "showdown legality: the seat asked may always table, may muck exactly when it does not beat or tie the tabled hands of a contested pot, every other seat is refused, and a refused choice changes nothing",
    { source: session },
    ({ source }) => {
      const mismatches: string[] = [];

      for (const step of playSession(source).steps) {
        const pending = pendingDecisions(step.before);

        const hand = TableStates.$is("InHand")(step.before)
          ? step.before.hand
          : undefined;

        if (
          !PendingDecisions.$is("Show")(pending) ||
          hand === undefined ||
          !Phases.$is("ShowingDown")(hand.phase)
        ) {
          continue;
        }

        const { entries } = hand.phase;
        const asked = pending.choices.seat;
        const player = hand.players.find((dealt) => dealt.seat === asked);
        const tabled = new Map<SeatIndex, number>();

        for (const entry of entries) {
          if (ShowdownEntries.$is("Shown")(entry)) {
            tabled.set(entry.seat, entry.rank);
          }
        }

        const claims = claimsAfterChoices(
          buildPots(hand).map((pot) => pot.eligible),
          entries.map((entry) => ({
            mucked: ShowdownEntries.$is("Mucked")(entry),
            seat: entry.seat,
          }))
        );

        const forced = mustTable(
          claims,
          tabled,
          asked,
          evaluate([...(player?.holeCards ?? []), ...hand.board])
        );

        if (!accepts(step.before, Commands.TableHand({ seat: asked }))) {
          mismatches.push(`seat ${asked} could not table`);
        }

        if (
          accepts(step.before, Commands.MuckHand({ seat: asked })) === forced
        ) {
          mismatches.push(`seat ${asked} muck accepted is ${!forced}`);
        }

        if (pending.choices.canMuck === forced || !pending.choices.canTable) {
          mismatches.push(`seat ${asked} offered the wrong choices`);
        }

        for (const other of hand.players.filter(
          (dealt) => dealt.seat !== asked
        )) {
          if (
            accepts(step.before, Commands.TableHand({ seat: other.seat })) ||
            accepts(step.before, Commands.MuckHand({ seat: other.seat }))
          ) {
            mismatches.push(`seat ${other.seat} chose out of turn`);
          }
        }
      }

      expect(mismatches).toStrictEqual([]);
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

          if (Events.$is("HandTabled")(event)) {
            expect(ownCards(event.seat, event.cards)).toBe(true);
          }
        }

        const { hidden } = replayShowdown(hand);
        const showing = hand.filter(Events.$is("CardsShown"));

        for (const seatIndex of hidden) {
          const secret = holes.get(seatIndex) ?? [];

          const named = new Set(hand.flatMap(cardsMadePublic));

          const revealed = new Set(
            showing.flatMap((shown) =>
              shown.seat === seatIndex ? shown.cards : []
            )
          );

          expect(
            secret.filter((card) => named.has(card) && !revealed.has(card))
          ).toStrictEqual([]);
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

        const livePosted = livePost(event);

        if (livePosted !== undefined) {
          posted.set(
            livePosted.seat,
            (posted.get(livePosted.seat) ?? 0) + livePosted.amount
          );
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
