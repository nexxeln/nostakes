import { Option, Result } from "effect";

import {
  Actions,
  Antes,
  Commands,
  MAX_RUNS,
  PendingDecisions,
  SEAT_COUNT,
  Seats,
  TableStates,
  decide,
  evolve,
  invariants,
  legalActions,
  pendingDecisions,
} from "../../src/index.js";
import type {
  Card,
  Command,
  Event,
  TableConfig,
  TableState,
} from "../../src/index.js";
import {
  bankrollChange,
  chipCount,
  player,
  runCount,
  seat,
} from "../fixtures.js";

const seats = Array.from({ length: SEAT_COUNT }, (_, index) => seat(index));

const raiseTargets = (state: TableState) =>
  Option.match(legalActions(state), {
    onNone: () => [0, 1, 20],
    onSome: (legal) =>
      Option.match(legal.raise, {
        onNone: () => [0, 1, 20],
        onSome: ({ maxTo, minTo }) => [0, minTo - 1, minTo, maxTo, maxTo + 1],
      }),
  }).filter((to) => to >= 0);

const runCounts = (state: TableState) =>
  PendingDecisions.$match(pendingDecisions(state), {
    Bet: () => [1, 2],
    ChooseRuns: ({ maxRuns }) => [1, maxRuns, maxRuns + 1],
    Nothing: () => [1, 2],
  })
    .filter((count) => count <= MAX_RUNS)
    .map((count) => runCount(count));

const lastHandCards = (state: TableState) =>
  TableStates.$is("BetweenHands")(state)
    ? Option.match(state.lastHand, {
        onNone: () => [],
        onSome: (lastHand) =>
          lastHand.players.flatMap(
            (
              dealt
            ): { readonly cards: readonly Card[]; readonly seat: number }[] => [
              ...dealt.holeCards.map((card) => ({
                cards: [card],
                seat: dealt.seat,
              })),
              { cards: dealt.holeCards, seat: dealt.seat },
              {
                cards: dealt.holeCards.slice(0, 1),
                seat: (dealt.seat + 1) % SEAT_COUNT,
              },
            ]
          ),
      })
    : [];

const configs = (current: TableConfig): readonly TableConfig[] => [
  current,
  {
    ...current,
    ante: Antes.BigBlindPays({ amount: chipCount(1000) }),
    bigBlind: chipCount(500),
    maxRuns: runCount(4),
    rabbitHunt: true,
    smallBlind: chipCount(250),
    straddle: { button: true, underTheGun: 6 },
  },
];

const straddleLists = [[], [3], [0], [4, 5], [8, 0, 1], [2, 2]];

export const commandMatrix = (state: TableState): readonly Command[] => [
  ...seats.flatMap((index) => [
    Commands.Act({ action: Actions.Fold(), seat: index }),
    Commands.Act({ action: Actions.Check(), seat: index }),
    Commands.Act({ action: Actions.Call(), seat: index }),
    ...raiseTargets(state).map((to) =>
      Commands.Act({
        action: Actions.RaiseTo({ to: chipCount(to) }),
        seat: index,
      })
    ),
    ...runCounts(state).map((runs) =>
      Commands.ChooseRuns({ runs, seat: index })
    ),
    Commands.RabbitHunt({ seat: index }),
    Commands.StandUp({ seat: index }),
    Commands.AddChips({ amount: chipCount(25), seat: index }),
    Commands.AddChips({ amount: chipCount(0), seat: index }),
    Commands.SetSittingOut({ seat: index, sittingOut: true }),
    Commands.SetSittingOut({ seat: index, sittingOut: false }),
    Commands.SitDown({
      buyIn: chipCount(50),
      player: player(`newcomer${index}`),
      seat: index,
    }),
    Commands.SitDown({
      buyIn: chipCount(50),
      player: player("p0"),
      seat: index,
    }),
    Commands.SitDown({
      buyIn: chipCount(0),
      player: player(`broke${index}`),
      seat: index,
    }),
  ]),
  ...lastHandCards(state).map((show) =>
    Commands.ShowCards({ cards: show.cards, seat: seat(show.seat) })
  ),
  ...configs(state.config).map((config) => Commands.ChangeRules({ config })),
];

export const startCommands = (deck: Command): readonly Command[] =>
  Commands.$is("StartHand")(deck)
    ? straddleLists.map((straddles) =>
        Commands.StartHand({
          deck: deck.deck,
          straddles: straddles.map((index) => seat(index)),
        })
      )
    : [];

const stacksTotal = (state: TableState) =>
  state.seats.reduce(
    (total, current) =>
      total + (Seats.$is("Occupied")(current) ? current.stack : 0),
    0
  );

export const chipsOnTable = (state: TableState) =>
  TableStates.$is("InHand")(state)
    ? state.hand.players.reduce(
        (total, dealt) => total + dealt.committedTotal - dealt.won,
        stacksTotal(state) + state.hand.deadMoney
      )
    : stacksTotal(state);

export const totalityProblems = (
  state: TableState,
  command: Command
): readonly string[] => {
  const label = `${state._tag} ${command._tag} ${JSON.stringify(command).slice(0, 120)}`;

  try {
    return Result.match(decide(state, command), {
      onFailure: () => [],
      onSuccess: (events: readonly Event[]) => {
        const problems: string[] = [];
        const before = chipsOnTable(state);
        let current = state;
        let bankroll = 0;

        for (const event of events) {
          current = evolve(current, event);
          bankroll += bankrollChange(event);

          for (const found of invariants(current)) {
            problems.push(`${label}: ${event._tag} ${found.invariant}`);
          }
        }

        if (chipsOnTable(current) !== before + bankroll) {
          problems.push(`${label}: chips moved without a buy-in`);
        }

        pendingDecisions(current);
        legalActions(current);

        return problems;
      },
    });
  } catch (error) {
    return [`${label}: threw ${String(error)}`];
  }
};
