import type { PlayerId } from "@nostakes/engine";
import { Option, Result } from "effect";

import { RoomCommands } from "./commands.js";
import type { RoomCommand, RoomCommandOf } from "./commands.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import type { RoomEvent } from "./events.js";
import { Actors } from "./identity.js";
import { QuietNotDue } from "./rejection.js";
import {
  Attendances,
  RoomStates,
  SEATS,
  isMember,
  occupantAt,
} from "./state.js";
import type { Open, RoomState } from "./state.js";
import { latest, secondsAfter } from "./time.js";
import type { Millis } from "./time.js";

export const seatedPlayers = (state: Open): readonly PlayerId[] =>
  SEATS.flatMap((seat) =>
    Option.toArray(occupantAt(state.table, seat)).map(({ player }) => player)
  );

const hostEvents = (
  state: Open,
  connected: readonly PlayerId[],
  at: Millis
): readonly RoomEvent[] => {
  const here = connected.includes(state.host) || !isMember(state, state.host);

  return Option.match(state.hostAway, {
    onNone: () => (here ? [] : [RoomEvents.HostAway({ at })]),
    onSome: () => (here ? [RoomEvents.HostBack({ at })] : []),
  });
};

const tableEvents = (
  state: Open,
  connected: readonly PlayerId[],
  at: Millis
): readonly RoomEvent[] => {
  const seated = seatedPlayers(state);

  const back = Option.fromUndefinedOr(
    seated.find((player) => connected.includes(player))
  );

  return Attendances.$match(state.attendance, {
    Attended: () =>
      Option.isNone(back) && seated.length > 0
        ? [RoomEvents.TableUnattended({ at })]
        : [],
    Quiet: ({ pausedAt }) =>
      Option.toArray(back).map((player) =>
        RoomEvents.TableAttended({
          at,
          player,
          quietSince: Option.some(pausedAt),
        })
      ),
    Unattended: () =>
      Option.toArray(back).map((player) =>
        RoomEvents.TableAttended({ at, player, quietSince: Option.none() })
      ),
  });
};

export const attendanceEvents = (
  state: Open,
  connected: readonly PlayerId[],
  at: Millis
): readonly RoomEvent[] => [
  ...tableEvents(state, connected, at),
  ...hostEvents(state, connected, at),
];

export const noteAttendance = (
  state: Open,
  command: RoomCommandOf<"NoteAttendance">
): Decision =>
  Result.succeed(attendanceEvents(state, command.connected, command.at));

export const quietDueAt = (state: Open): Option.Option<Millis> =>
  Attendances.$is("Unattended")(state.attendance)
    ? Option.some(
        secondsAfter(
          state.attendance.since,
          state.settings.pauseWhenAwaySeconds
        )
      )
    : Option.none();

export const quietTable = (state: Open, at: Millis): Decision =>
  Option.match(quietDueAt(state), {
    onNone: () => Result.fail(new QuietNotDue({ due: Option.none() })),
    onSome: (due) =>
      at < due
        ? Result.fail(new QuietNotDue({ due: Option.some(due) }))
        : Result.succeed([RoomEvents.TableWentQuiet({ at })]),
  });

export const tableQuiet = (state: Open) =>
  Attendances.$is("Quiet")(state.attendance);

export const attendanceCommand = (
  state: RoomState,
  connected: readonly PlayerId[],
  at: Millis
): Option.Option<RoomCommand> =>
  RoomStates.$match(state, {
    Closed: () => Option.none(),
    Open: (open) =>
      attendanceEvents(open, connected, latest(at, open.now)).length > 0
        ? Option.some(
            RoomCommands.NoteAttendance({
              at,
              by: Actors.Server(),
              connected,
            })
          )
        : Option.none(),
  });
