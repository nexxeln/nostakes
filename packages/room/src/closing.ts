import { Commands, TableStates } from "@nostakes/engine";
import { Option, Result } from "effect";

import { inSequence } from "./batch.js";
import type { Step } from "./batch.js";
import type { RoomCommandOf } from "./commands.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import { settlementOf } from "./money.js";
import { CloseAlreadyQueued } from "./rejection.js";
import { SEATS, occupantAt } from "./state.js";
import type { Open } from "./state.js";
import { onTable } from "./table.js";
import type { Millis } from "./time.js";

export const closingSteps = (state: Open, at: Millis): readonly Step[] => [
  ...SEATS.filter((seat) => Option.isSome(occupantAt(state.table, seat))).map(
    (seat): Step =>
      (current) =>
        onTable(current.table, Commands.StandUp({ seat }), at)
  ),
  (current) =>
    Result.map(settlementOf(current), (settlement) => [
      RoomEvents.RoomClosed({ at, settlement }),
    ]),
];

export const closeRoom = (
  state: Open,
  command: RoomCommandOf<"CloseRoom">
): Decision => {
  const { table } = state;

  if (TableStates.$is("InHand")(table)) {
    return state.queued.close
      ? Result.fail(new CloseAlreadyQueued({ handNumber: table.handNumber }))
      : Result.succeed([RoomEvents.CloseQueued({ at: command.at })]);
  }

  return inSequence(state, closingSteps(state, command.at));
};
