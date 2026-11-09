import type { Result } from "effect";

import { Commands } from "./commands.js";
import type { Command } from "./commands.js";
import { Events } from "./events.js";
import type { Event } from "./events.js";
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
});

export const decide = (state: TableState, command: Command) =>
  decideCommand(command)(state);

const evolveEvent = Events.$match({
  ChipsAdded:
    (event) =>
    (state: TableState): TableState =>
      addToStack(state, event.seat, event.amount),
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
});

export const evolve = (state: TableState, event: Event) =>
  evolveEvent(event)(state);

export const replay = (config: TableConfig, events: readonly Event[]) => {
  let state = initialTable(config);

  for (const event of events) {
    state = evolve(state, event);
  }

  return state;
};
