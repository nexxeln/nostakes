import { Option, Result } from "effect";

import { RoomCommands } from "./commands.js";
import type { RoomCommand, RoomCommandOf } from "./commands.js";
import type { Deadline } from "./deadline.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import type { RoomEvent } from "./events.js";
import { Actors } from "./identity.js";
import { RoomStates } from "./state.js";
import type { Open, RoomState } from "./state.js";
import type { Millis } from "./time.js";

export const noteStall = (
  state: Open,
  command: RoomCommandOf<"NoteStall">
): Decision =>
  Result.succeed(
    Option.isSome(state.stalled)
      ? []
      : [
          RoomEvents.TableStalled({
            at: command.at,
            deadline: command.deadline,
          }),
        ]
  );

const DEADLINE_ANSWERS: ReadonlySet<RoomCommand["_tag"]> = new Set([
  "Deal",
  "DealSealed",
  "ExpireClock",
  "LapseKnocks",
  "QuietTable",
  "RunQueue",
  "SealHand",
]);

export const isStalled = (state: Open) => Option.isSome(state.stalled);

export const clearingStall = (
  state: Open,
  command: RoomCommand,
  events: readonly RoomEvent[],
  at: Millis
): readonly RoomEvent[] =>
  isStalled(state) && DEADLINE_ANSWERS.has(command._tag)
    ? [RoomEvents.StallCleared({ at }), ...events]
    : events;

export const stallCommand = (
  state: RoomState,
  deadline: Deadline,
  at: Millis
): Option.Option<RoomCommand> =>
  RoomStates.$match(state, {
    Closed: () => Option.none(),
    Open: (open) =>
      isStalled(open)
        ? Option.none()
        : Option.some(
            RoomCommands.NoteStall({ at, by: Actors.Server(), deadline })
          ),
  });
