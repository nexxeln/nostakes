import { Data, Option, Result } from "effect";

import { Actions } from "./actions.js";
import type { Action, LegalActions } from "./actions.js";
import type { Card } from "./cards.js";
import type { CommandOf } from "./commands.js";
import { Events } from "./events.js";
import type { Event, EventOf } from "./events.js";
import type { Chips, SeatIndex } from "./primitives.js";
import { SEAT_COUNT, chips } from "./primitives.js";
import { IllegalAction, NoBettingRound, NotYourTurn } from "./rejection.js";
import type { TableConfig } from "./rules.js";
import { choosesRuns, runCap } from "./run-outs.js";
import {
  Phases,
  activePlayers,
  commit,
  isInHand,
  notFolded,
  playersClockwiseAfter,
  stackOf,
  updatePlayer,
  whenInHand,
  withHand,
  withStackChange,
} from "./state.js";
import type {
  Betting,
  Hand,
  HandPlayer,
  InHand,
  Phase,
  Round,
  Street,
  TableState,
} from "./state.js";

export const openRound = (currentBet: Chips, lastFullRaise: Chips): Round => ({
  actedAt: Array.from({ length: SEAT_COUNT }, () => Option.none()),
  currentBet,
  lastAggressor: Option.none(),
  lastFullRaise,
});

const hasActed = (round: Round, seat: SeatIndex) =>
  Option.isSome(round.actedAt[seat] ?? Option.none());

const needsToAct = (round: Round, player: HandPlayer, activeCount: number) =>
  player.status === "Active" &&
  (player.committedThisStreet < round.currentBet ||
    (!hasActed(round, player.seat) && activeCount > 1));

export const seatToAct = (hand: Hand, round: Round, after: SeatIndex) => {
  const activeCount = activePlayers(hand).length;

  if (notFolded(hand).length < 2) {
    return Option.none();
  }

  return Option.map(
    Option.fromUndefinedOr(
      playersClockwiseAfter(hand.players, after).find((player) =>
        needsToAct(round, player, activeCount)
      )
    ),
    (player) => player.seat
  );
};

export const closedStreet = (
  config: TableConfig,
  hand: Hand,
  lastAggressor: Option.Option<SeatIndex>
): Phase => {
  const maxRuns = runCap(config, hand);

  return choosesRuns(hand, maxRuns)
    ? Phases.ChoosingRuns({
        choices: [],
        maxRuns,
        pending: notFolded(hand).map((player) => player.seat),
      })
    : Phases.Settling({ lastAggressor });
};

export const continueBetting = (
  config: TableConfig,
  hand: Hand,
  round: Round,
  after: SeatIndex
): Phase =>
  Option.match(seatToAct(hand, round, after), {
    onNone: () => closedStreet(config, hand, round.lastAggressor),
    onSome: (toAct) => Phases.Betting({ ...round, toAct }),
  });

const reopenedFor = (round: Round, seat: SeatIndex) =>
  Option.match(round.actedAt[seat] ?? Option.none(), {
    onNone: () => true,
    onSome: (bet) => round.currentBet - bet >= round.lastFullRaise,
  });

const legalFor = (state: InHand, betting: Betting): LegalActions => {
  const player = state.hand.players.find(
    (candidate) => candidate.seat === betting.toAct
  );

  const committed = player?.committedThisStreet ?? 0;
  const stack = stackOf(state, betting.toAct);
  const owed = Math.max(0, betting.currentBet - committed);
  const allInTo = committed + stack;

  const othersCanRespond = state.hand.players.some(
    (other) => other.seat !== betting.toAct && other.status === "Active"
  );

  const canRaise =
    allInTo > betting.currentBet &&
    othersCanRespond &&
    reopenedFor(betting, betting.toAct);

  return {
    call: owed > 0 ? Option.some(chips(Math.min(owed, stack))) : Option.none(),
    canCheck: owed === 0,
    raise: canRaise
      ? Option.some({
          maxTo: chips(allInTo),
          minTo: chips(
            Math.min(betting.currentBet + betting.lastFullRaise, allInTo)
          ),
        })
      : Option.none(),
    seat: betting.toAct,
  };
};

export const legalActions = (state: TableState): Option.Option<LegalActions> =>
  isInHand(state) && Phases.$is("Betting")(state.hand.phase)
    ? Option.some(legalFor(state, state.hand.phase))
    : Option.none();

export type PendingDecision = Data.TaggedEnum<{
  Bet: { readonly legal: LegalActions };
  ChooseRuns: {
    readonly maxRuns: number;
    readonly seats: readonly SeatIndex[];
  };
  Nothing: { readonly handNumber: number };
}>;

export const PendingDecisions = Data.taggedEnum<PendingDecision>();

export const pendingDecisions = (state: TableState): PendingDecision => {
  if (!isInHand(state)) {
    return PendingDecisions.Nothing({ handNumber: state.handNumber });
  }

  return Phases.$match(state.hand.phase, {
    Betting: (betting) =>
      PendingDecisions.Bet({ legal: legalFor(state, betting) }),
    ChoosingRuns: (choosing) =>
      choosing.pending.length > 0
        ? PendingDecisions.ChooseRuns({
            maxRuns: choosing.maxRuns,
            seats: choosing.pending,
          })
        : PendingDecisions.Nothing({ handNumber: state.handNumber }),
    RunningOut: () =>
      PendingDecisions.Nothing({ handNumber: state.handNumber }),
    Settling: () => PendingDecisions.Nothing({ handNumber: state.handNumber }),
  });
};

const actionEvents = (
  state: InHand,
  betting: Betting,
  action: Action
): Result.Result<readonly Event[], IllegalAction> => {
  const legal = legalFor(state, betting);
  const seat = betting.toAct;
  const stack = stackOf(state, seat);
  const illegal = () => Result.fail(new IllegalAction({ action, legal, seat }));

  const committed =
    state.hand.players.find((player) => player.seat === seat)
      ?.committedThisStreet ?? 0;

  return Actions.$match(action, {
    Call: () =>
      Option.match(legal.call, {
        onNone: illegal,
        onSome: (amount) =>
          Result.succeed([
            Events.Called({ allIn: amount === stack, amount, seat }),
          ]),
      }),
    Check: () =>
      legal.canCheck ? Result.succeed([Events.Checked({ seat })]) : illegal(),
    Fold: () => Result.succeed([Events.Folded({ seat })]),
    RaiseTo: ({ to }) =>
      Option.match(legal.raise, {
        onNone: illegal,
        onSome: (range) =>
          to >= range.minTo && to <= range.maxTo
            ? Result.succeed([
                Events.RaisedTo({
                  added: chips(to - committed),
                  allIn: to === range.maxTo,
                  full: to - betting.currentBet >= betting.lastFullRaise,
                  seat,
                  to,
                }),
              ])
            : illegal(),
      }),
  });
};

export const act = (state: TableState, command: CommandOf<"Act">) => {
  if (!isInHand(state) || !Phases.$is("Betting")(state.hand.phase)) {
    return Result.fail(new NoBettingRound({ seat: command.seat }));
  }

  const betting = state.hand.phase;

  if (betting.toAct !== command.seat) {
    return Result.fail(
      new NotYourTurn({ seat: command.seat, toAct: betting.toAct })
    );
  }

  return actionEvents(state, betting, command.action);
};

const whenBetting = (
  state: TableState,
  update: (inHand: InHand, betting: Betting) => TableState
) =>
  whenInHand(state, (inHand) =>
    Phases.$is("Betting")(inHand.hand.phase)
      ? update(inHand, inHand.hand.phase)
      : inHand
  );

const afterAction = (state: InHand, seat: SeatIndex, round: Round) =>
  withHand(state, {
    ...state.hand,
    phase: continueBetting(state.config, state.hand, round, seat),
  });

const actedAt = (round: Round, seat: SeatIndex, bet: Chips) =>
  round.actedAt.map((previous, index) =>
    index === seat ? Option.some(bet) : previous
  );

export const fold = (state: TableState, event: EventOf<"Folded">) =>
  whenBetting(state, (inHand, betting) =>
    afterAction(
      withHand(
        inHand,
        updatePlayer(inHand.hand, event.seat, (player) => ({
          ...player,
          status: "Folded",
        }))
      ),
      event.seat,
      betting
    )
  );

export const check = (state: TableState, event: EventOf<"Checked">) =>
  whenBetting(state, (inHand, betting) =>
    afterAction(inHand, event.seat, {
      ...betting,
      actedAt: actedAt(betting, event.seat, betting.currentBet),
    })
  );

export const call = (state: TableState, event: EventOf<"Called">) =>
  whenBetting(state, (inHand, betting) =>
    afterAction(commit(inHand, event.seat, event.amount, true), event.seat, {
      ...betting,
      actedAt: actedAt(betting, event.seat, betting.currentBet),
    })
  );

export const raise = (state: TableState, event: EventOf<"RaisedTo">) =>
  whenBetting(state, (inHand, betting) =>
    afterAction(commit(inHand, event.seat, event.added, true), event.seat, {
      actedAt: actedAt(betting, event.seat, event.to),
      currentBet: event.to,
      lastAggressor: Option.some(event.seat),
      lastFullRaise: event.full
        ? chips(event.to - betting.currentBet)
        : betting.lastFullRaise,
    })
  );

export const returnUncalled = (
  state: TableState,
  event: EventOf<"UncalledBetReturned">
) =>
  whenInHand(state, (inHand) => {
    const seats = withStackChange(inHand.seats, event.seat, event.amount);

    const hand = updatePlayer(inHand.hand, event.seat, (player) => ({
      ...player,
      committedThisStreet: chips(
        Math.max(0, player.committedThisStreet - event.amount)
      ),
      committedTotal: chips(player.committedTotal - event.amount),
      status: player.status === "AllIn" ? "Active" : player.status,
    }));

    const phase = Phases.$is("Settling")(hand.phase)
      ? closedStreet(inHand.config, hand, hand.phase.lastAggressor)
      : hand.phase;

    return { ...inHand, hand: { ...hand, phase }, seats };
  });

const NEXT_STREET: Readonly<
  Record<Street, { readonly cards: number; readonly street: Street }>
> = {
  Flop: { cards: 1, street: "Turn" },
  Preflop: { cards: 3, street: "Flop" },
  River: { cards: 0, street: "River" },
  Turn: { cards: 1, street: "River" },
};

export const nextStreet = (hand: Hand) => {
  const next = NEXT_STREET[hand.street];

  return Events.StreetDealt({
    cards: hand.deck.slice(0, next.cards),
    run: 1,
    street: next.street,
  });
};

const dealToRun = (
  state: InHand,
  event: EventOf<"StreetDealt">,
  runs: readonly (readonly Card[])[]
) =>
  withHand(state, {
    ...state.hand,
    deck: state.hand.deck.slice(event.cards.length),
    phase: Phases.RunningOut({
      runs: runs.map((cards, index) =>
        index === event.run - 1 ? [...cards, ...event.cards] : cards
      ),
    }),
  });

const dealToBoard = (state: InHand, cards: readonly Card[], street: Street) => {
  const hand: Hand = {
    ...state.hand,
    board: [...state.hand.board, ...cards],
    deck: state.hand.deck.slice(cards.length),
    players: state.hand.players.map((player) => ({
      ...player,
      committedThisStreet: chips(0),
    })),
    street,
  };

  return withHand(state, {
    ...hand,
    phase: continueBetting(
      state.config,
      hand,
      openRound(chips(0), state.config.bigBlind),
      state.button
    ),
  });
};

export const dealStreet = (state: TableState, event: EventOf<"StreetDealt">) =>
  whenInHand(state, (inHand) =>
    Phases.$is("RunningOut")(inHand.hand.phase)
      ? dealToRun(inHand, event, inHand.hand.phase.runs)
      : dealToBoard(inHand, event.cards, event.street)
  );

export const streetIsOpen = (hand: Hand) =>
  notFolded(hand).length > 1 &&
  activePlayers(hand).length > 1 &&
  hand.board.length < 5;
