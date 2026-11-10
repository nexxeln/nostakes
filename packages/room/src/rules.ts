import { Antes, Commands } from "@nostakes/engine";
import type { Ante, TableConfig } from "@nostakes/engine";
import { Option, Result } from "effect";

import type { RoomCommandOf } from "./commands.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import { handInProgress } from "./state.js";
import type { Open } from "./state.js";
import { onTable } from "./table.js";

const anteKey = (ante: Ante) =>
  Antes.$match(ante, {
    BigBlindPays: ({ amount }) => `big blind pays ${amount}`,
    EveryPlayer: ({ amount }) => `every player ${amount}`,
    NoAnte: () => "no ante",
  });

export const sameTableRules = (left: TableConfig, right: TableConfig) =>
  anteKey(left.ante) === anteKey(right.ante) &&
  left.bigBlind === right.bigBlind &&
  left.smallBlind === right.smallBlind &&
  left.maxRuns === right.maxRuns &&
  left.rabbitHunt === right.rabbitHunt &&
  left.straddle.button === right.straddle.button &&
  left.straddle.underTheGun === right.straddle.underTheGun;

export const changeSettings = (
  state: Open,
  command: RoomCommandOf<"ChangeSettings">
): Decision => {
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
