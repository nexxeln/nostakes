import { Commands, TableConfigSchema } from "@nostakes/engine";
import { Option, Result, Schema } from "effect";

import type { RoomCommandOf } from "./commands.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import { SeatsStillTaken } from "./rejection.js";
import { seatsTakenFrom } from "./seats.js";
import { handInProgress } from "./state.js";
import type { Open } from "./state.js";
import { onTable } from "./table.js";

export const sameTableRules = Schema.toEquivalence(TableConfigSchema);

export const changeSettings = (
  state: Open,
  command: RoomCommandOf<"ChangeSettings">
): Decision => {
  const stillTaken = seatsTakenFrom(state, command.settings.seats);

  if (stillTaken.length > 0) {
    return Result.fail(
      new SeatsStillTaken({
        seats: stillTaken,
        wanted: command.settings.seats,
      })
    );
  }

  const wanted = command.settings.table;
  const current = state.table.config;
  const unchanged = sameTableRules(wanted, current);

  if (handInProgress(state)) {
    return Result.succeed([
      RoomEvents.SettingsChanged({
        at: command.at,
        settings: { ...command.settings, table: current },
      }),
      ...(unchanged && Option.isNone(state.queued.rules)
        ? []
        : [RoomEvents.RulesQueued({ at: command.at, config: wanted })]),
    ]);
  }

  const settingsChanged = RoomEvents.SettingsChanged({
    at: command.at,
    settings: command.settings,
  });

  return unchanged
    ? Result.succeed([settingsChanged])
    : Result.map(
        onTable(
          state.table,
          Commands.ChangeRules({ config: wanted }),
          command.at
        ),
        (changed) => [...changed, settingsChanged]
      );
};
