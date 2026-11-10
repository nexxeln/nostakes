import { Commands } from "@nostakes/engine";
import type { Command, PlayerId, SeatIndex } from "@nostakes/engine";
import { Match, Result } from "effect";

import { timeoutsInARow } from "./clocks.js";
import type { RoomCommand } from "./commands.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import type { RoomEvent } from "./events.js";
import { heldSeat } from "./state.js";
import type { Open } from "./state.js";
import { onTable } from "./table.js";

export type PlayCommand = Extract<
  RoomCommand,
  {
    readonly _tag:
      | "Act"
      | "ChooseRuns"
      | "MuckHand"
      | "RabbitHunt"
      | "ShowCards"
      | "TableHand";
  }
>;

const forSeat = (command: PlayCommand, seat: SeatIndex): Command =>
  Match.valueTags(command, {
    Act: ({ action }) => Commands.Act({ action, seat }),
    ChooseRuns: ({ runs }) => Commands.ChooseRuns({ runs, seat }),
    MuckHand: () => Commands.MuckHand({ seat }),
    RabbitHunt: () => Commands.RabbitHunt({ seat }),
    ShowCards: ({ cards }) => Commands.ShowCards({ cards, seat }),
    TableHand: () => Commands.TableHand({ seat }),
  });

const ENDS_A_TIMEOUT_STREAK: ReadonlySet<PlayCommand["_tag"]> = new Set([
  "Act",
  "ChooseRuns",
  "MuckHand",
  "TableHand",
]);

const streakEnded = (
  state: Open,
  player: PlayerId,
  command: PlayCommand
): readonly RoomEvent[] =>
  ENDS_A_TIMEOUT_STREAK.has(command._tag) && timeoutsInARow(state, player) > 0
    ? [RoomEvents.TimeoutStreakEnded({ at: command.at, player })]
    : [];

export const play = (
  state: Open,
  player: PlayerId,
  command: PlayCommand
): Decision =>
  Result.flatMap(heldSeat(state, player), (seat) =>
    Result.map(
      onTable(state.table, forSeat(command, seat), command.at),
      (events) => [...events, ...streakEnded(state, player, command)]
    )
  );
