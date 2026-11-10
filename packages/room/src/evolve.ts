import { Events, evolve as evolveTable, initialTable } from "@nostakes/engine";
import type { Event, PlayerId, SeatIndex } from "@nostakes/engine";
import { Option } from "effect";

import { RoomEvents } from "./events.js";
import type { RoomEvent, RoomEventOf } from "./events.js";
import { boughtIn, cashedOut, withEntry } from "./money.js";
import { EMPTY_QUEUE, RoomStates, occupantAt } from "./state.js";
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

const vacated = (state: Open, player: PlayerId, seat: SeatIndex): Open => ({
  ...state,
  away: state.away.filter((awaySeat) => awaySeat !== seat),
  queued: {
    ...state.queued,
    leaving: state.queued.leaving.filter((leaving) => leaving !== player),
  },
  requests: {
    ...state.requests,
    chips: state.requests.chips.filter((request) => request.player !== player),
  },
  straddlers: state.straddlers.filter((straddler) => straddler !== player),
});

const onTable = (state: Open, event: Event): Open => {
  const next = { ...state, table: evolveTable(state.table, event) };

  return Events.$is("PlayerStood")(event)
    ? vacated(next, event.player, event.seat)
    : next;
};

const withoutSeatRequest = (state: Open, player: PlayerId): Open => ({
  ...state,
  requests: {
    ...state.requests,
    seats: state.requests.seats.filter((request) => request.player !== player),
  },
});

const withoutChipRequest = (state: Open, player: PlayerId): Open => ({
  ...state,
  requests: {
    ...state.requests,
    chips: state.requests.chips.filter((request) => request.player !== player),
  },
});

const evolveOpen = (state: Open, event: RoomEvent): RoomState =>
  RoomEvents.$match(event, {
    BoughtIn: ({ amount, player, seat }) => ({
      ...state,
      entries: withEntry(state.entries, boughtIn(player, amount)),
      table: evolveTable(
        state.table,
        Option.isSome(occupantAt(state.table, seat))
          ? Events.ChipsAdded({ amount, seat })
          : Events.PlayerSat({ buyIn: amount, player, seat })
      ),
    }),
    CashedOut: ({ amount, player, seat }) =>
      onTable(
        {
          ...state,
          entries: withEntry(state.entries, cashedOut(player, amount)),
        },
        Events.PlayerStood({ player, seat, stack: amount })
      ),
    ChipsApproved: ({ player }) => withoutChipRequest(state, player),
    ChipsDenied: ({ player }) => withoutChipRequest(state, player),
    ChipsRequested: ({ amount, player }) => ({
      ...state,
      requests: {
        ...state.requests,
        chips: [...state.requests.chips, { amount, player }],
      },
    }),
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
    SeatApproved: ({ player }) => withoutSeatRequest(state, player),
    SeatDenied: ({ player }) => withoutSeatRequest(state, player),
    SeatRequested: ({ buyIn, player, seat }) => ({
      ...state,
      requests: {
        ...state.requests,
        seats: [...state.requests.seats, { buyIn, player, seat }],
      },
    }),
    Table: ({ event: tableEvent }) => onTable(state, tableEvent),
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
