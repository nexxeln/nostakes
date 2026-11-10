import { Events, decide as decideTable } from "@nostakes/engine";
import type { Command, Event, TableState } from "@nostakes/engine";
import { Option, Result } from "effect";

import { RoomEvents } from "./events.js";
import type { RoomEvent } from "./events.js";
import { TableRejected } from "./rejection.js";
import { occupantAt } from "./state.js";
import type { Millis } from "./time.js";

const asRoomEvent = (
  table: TableState,
  event: Event,
  at: Millis
): RoomEvent => {
  if (Events.$is("PlayerSat")(event)) {
    return RoomEvents.BoughtIn({
      amount: event.buyIn,
      at,
      player: event.player,
      seat: event.seat,
    });
  }

  if (Events.$is("ChipsAdded")(event)) {
    return Option.match(occupantAt(table, event.seat), {
      onNone: () => RoomEvents.Table({ at, event }),
      onSome: (occupant) =>
        RoomEvents.BoughtIn({
          amount: event.amount,
          at,
          player: occupant.player,
          seat: event.seat,
        }),
    });
  }

  if (Events.$is("PlayerStood")(event) && event.stack > 0) {
    return RoomEvents.CashedOut({
      amount: event.stack,
      at,
      player: event.player,
      seat: event.seat,
    });
  }

  return RoomEvents.Table({ at, event });
};

export const onTable = (table: TableState, command: Command, at: Millis) =>
  Result.mapBoth(decideTable(table, command), {
    onFailure: (rejection) => new TableRejected({ rejection }),
    onSuccess: (events) => events.map((event) => asRoomEvent(table, event, at)),
  });
