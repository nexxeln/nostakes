import { Option, Result } from "effect";

import {
  act,
  call,
  check,
  dealStreet,
  fold,
  nextStreet,
  raise,
  returnUncalled,
  streetIsOpen,
  uncalledExcess,
} from "./betting.js";
import { Commands } from "./commands.js";
import type { Command } from "./commands.js";
import { Events } from "./events.js";
import type { Event } from "./events.js";
import {
  beginHand,
  dealHoleCards,
  postAnte,
  postBlind,
  postStraddle,
  startHand,
} from "./forced-bets.js";
import { awardPot, endHand, foldOut } from "./pots.js";
import type { SeatIndex } from "./primitives.js";
import type { Rejection } from "./rejection.js";
import type { TableConfig } from "./rules.js";
import {
  addChips,
  addToStack,
  changeRules,
  emptySeat,
  markSittingOut,
  seatPlayer,
  setSittingOut,
  sitDown,
  standUp,
} from "./seating.js";
import { revealShowdown, showdown } from "./showdown.js";
import { Phases, initialTable, isInHand, notFolded } from "./state.js";
import type { InHand, TableState } from "./state.js";

type Decision = Result.Result<readonly Event[], Rejection>;

const decideCommand = Commands.$match({
  Act:
    (command) =>
    (state: TableState): Decision =>
      act(state, command),
  AddChips:
    (command) =>
    (state: TableState): Decision =>
      addChips(state, command),
  ChangeRules:
    (command) =>
    (state: TableState): Decision =>
      changeRules(state, command),
  SetSittingOut:
    (command) =>
    (state: TableState): Decision =>
      setSittingOut(state, command),
  SitDown:
    (command) =>
    (state: TableState): Decision =>
      sitDown(state, command),
  StandUp:
    (command) =>
    (state: TableState): Decision =>
      standUp(state, command),
  StartHand:
    (command) =>
    (state: TableState): Decision =>
      startHand(state, command),
});

const evolveEvent = Events.$match({
  AntePosted:
    (event) =>
    (state: TableState): TableState =>
      postAnte(state, event),
  BlindPosted:
    (event) =>
    (state: TableState): TableState =>
      postBlind(state, event),
  Called:
    (event) =>
    (state: TableState): TableState =>
      call(state, event),
  Checked:
    (event) =>
    (state: TableState): TableState =>
      check(state, event),
  ChipsAdded:
    (event) =>
    (state: TableState): TableState =>
      addToStack(state, event.seat, event.amount),
  Folded:
    (event) =>
    (state: TableState): TableState =>
      fold(state, event),
  HandEnded:
    () =>
    (state: TableState): TableState =>
      endHand(state),
  HandStarted:
    (event) =>
    (state: TableState): TableState =>
      beginHand(state, event),
  HoleCardsDealt:
    (event) =>
    (state: TableState): TableState =>
      dealHoleCards(state, event),
  PlayerSat:
    (event) =>
    (state: TableState): TableState =>
      seatPlayer(state, event),
  PlayerStood:
    (event) =>
    (state: TableState): TableState =>
      emptySeat(state, event),
  PotAwarded:
    (event) =>
    (state: TableState): TableState =>
      awardPot(state, event),
  RaisedTo:
    (event) =>
    (state: TableState): TableState =>
      raise(state, event),
  RulesChanged:
    (event) =>
    (state: TableState): TableState => ({
      ...state,
      config: event.config,
    }),
  ShowdownReached:
    (event) =>
    (state: TableState): TableState =>
      revealShowdown(state, event),
  SittingOutChanged:
    (event) =>
    (state: TableState): TableState =>
      markSittingOut(state, event),
  StraddlePosted:
    (event) =>
    (state: TableState): TableState =>
      postStraddle(state, event),
  StreetDealt:
    (event) =>
    (state: TableState): TableState =>
      dealStreet(state, event),
  UncalledBetReturned:
    (event) =>
    (state: TableState): TableState =>
      returnUncalled(state, event),
});

export const evolve = (state: TableState, event: Event) =>
  evolveEvent(event)(state);

export const evolveAll = (state: TableState, events: readonly Event[]) => {
  let current = state;

  for (const event of events) {
    current = evolve(current, event);
  }

  return current;
};

const afterStreet = (
  state: InHand,
  lastAggressor: Option.Option<SeatIndex>
): readonly Event[] => {
  if (notFolded(state.hand).length < 2) {
    return foldOut(state);
  }

  if (state.hand.board.length === 5) {
    return showdown(state, lastAggressor);
  }

  return streetIsOpen(state.hand) ? [nextStreet(state.hand)] : [];
};

const settle = (
  state: InHand,
  lastAggressor: Option.Option<SeatIndex>
): readonly Event[] =>
  Option.match(uncalledExcess(state.hand), {
    onNone: () => afterStreet(state, lastAggressor),
    onSome: (excess) => [Events.UncalledBetReturned(excess)],
  });

const automatic = (state: TableState): readonly Event[] =>
  isInHand(state) && Phases.$is("Settling")(state.hand.phase)
    ? settle(state, state.hand.phase.lastAggressor)
    : [];

const withAutomatic = (state: TableState, caused: readonly Event[]) => {
  const events = [...caused];
  let current = evolveAll(state, caused);

  for (
    let next = automatic(current);
    next.length > 0;
    next = automatic(current)
  ) {
    events.push(...next);
    current = evolveAll(current, next);
  }

  return events;
};

export const decide = (state: TableState, command: Command): Decision =>
  Result.map(decideCommand(command)(state), (caused) =>
    withAutomatic(state, caused)
  );

export const replay = (config: TableConfig, events: readonly Event[]) =>
  evolveAll(initialTable(config), events);
