import { initialTable } from "@nostakes/engine";
import { Option } from "effect";

import { RoomEvents } from "./events.js";
import type { RoomEvent, RoomEventOf } from "./events.js";
import { EMPTY_QUEUE, RoomStates } from "./state.js";
import type { Open, RoomState } from "./state.js";
import { latest } from "./time.js";

export const opened = (event: RoomEventOf<"RoomOpened">): Open =>
  RoomStates.Open({
    away: [],
    clocks: {
      bankSpent: new Map(),
      decision: Option.none(),
      lastHandEndedAt: Option.none(),
    },
    code: event.code,
    entries: new Map(),
    game: "Waiting",
    host: event.host,
    members: [],
    now: event.at,
    queued: EMPTY_QUEUE,
    record: Option.none(),
    requests: { chips: [], seats: [] },
    settings: event.settings,
    straddlers: [],
    table: initialTable(event.settings.table),
  });

const evolveOpen = (state: Open, event: RoomEvent): RoomState =>
  RoomEvents.$match(event, {
    HostChanged: ({ host }) => ({ ...state, host }),
    MemberJoined: ({ at, avatar, name, player }) => ({
      ...state,
      members: [...state.members, { avatar, joinedAt: at, name, player }],
    }),
    MemberLeft: ({ player }) => ({
      ...state,
      members: state.members.filter((member) => member.player !== player),
      requests: {
        chips: state.requests.chips.filter(
          (request) => request.player !== player
        ),
        seats: state.requests.seats.filter(
          (request) => request.player !== player
        ),
      },
    }),
    ProfileChanged: ({ avatar, name, player }) => ({
      ...state,
      members: state.members.map((member) =>
        member.player === player ? { ...member, avatar, name } : member
      ),
    }),
    RoomOpened: (opening) => opened(opening),
  });

export const evolve = (state: RoomState, event: RoomEvent): RoomState =>
  RoomStates.$match(state, {
    Closed: (closed) => closed,
    Open: (open) =>
      evolveOpen({ ...open, now: latest(open.now, event.at) }, event),
  });

export const evolveAll = (state: RoomState, events: readonly RoomEvent[]) => {
  let current = state;

  for (const event of events) {
    current = evolve(current, event);
  }

  return current;
};

export type RoomLog = readonly [RoomEventOf<"RoomOpened">, ...RoomEvent[]];

export const replay = ([first, ...rest]: RoomLog) =>
  evolveAll(opened(first), rest);
