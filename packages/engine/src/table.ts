import { Result } from "effect";

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
import { initialTable } from "./state.js";
import type { TableState } from "./state.js";

type Decision = Result.Result<readonly Event[], Rejection>;

const decideCommand = Commands.$match({
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
  ChipsAdded:
    (event) =>
    (state: TableState): TableState =>
      addToStack(state, event.seat, event.amount),
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
  RulesChanged:
    (event) =>
    (state: TableState): TableState => ({
      ...state,
      config: event.config,
    }),
  SittingOutChanged:
    (event) =>
    (state: TableState): TableState =>
      markSittingOut(state, event),
  StraddlePosted:
    (event) =>
    (state: TableState): TableState =>
      postStraddle(state, event),
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

const automatic = (_state: TableState): readonly Event[] => [];

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
