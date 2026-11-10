import { Events, evolve as evolveTable, initialTable } from "@nostakes/engine";
import type { Event, PlayerId, SeatIndex } from "@nostakes/engine";
import { Option } from "effect";

import { RoomEvents } from "./events.js";
import type { RoomEvent, RoomEventOf } from "./events.js";
import { boughtIn, cashedOut, withEntry } from "./money.js";
import {
  DecisionClocks,
  EMPTY_QUEUE,
  RoomStates,
  occupantAt,
} from "./state.js";
import type { DecisionClock, Open, Queue, RoomState } from "./state.js";
import { latest } from "./time.js";
import type { Millis } from "./time.js";

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

const onTable = (state: Open, event: Event, at: Millis): Open => {
  const next = { ...state, table: evolveTable(state.table, event) };

  if (Events.$is("PlayerStood")(event)) {
    return vacated(next, event.player, event.seat);
  }

  if (Events.$is("RulesChanged")(event)) {
    return {
      ...next,
      queued: { ...next.queued, rules: Option.none() },
      settings: { ...next.settings, table: event.config },
    };
  }

  if (Events.$is("SittingOutChanged")(event) && !event.sittingOut) {
    return {
      ...next,
      away: next.away.filter((seat) => seat !== event.seat),
    };
  }

  return Events.$is("HandEnded")(event)
    ? {
        ...next,
        clocks: {
          ...next.clocks,
          decision: Option.none(),
          lastHandEndedAt: Option.some(at),
        },
      }
    : next;
};

const withoutFirstChips = (queue: Queue, player: PlayerId): Queue => {
  const first = queue.chips.findIndex((queued) => queued.player === player);

  return first === -1
    ? queue
    : { ...queue, chips: queue.chips.toSpliced(first, 1) };
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

const withDecision = (
  state: Open,
  decision: Option.Option<DecisionClock>
): Open => ({ ...state, clocks: { ...state.clocks, decision } });

const bankStarted = (state: Open, deadline: Millis): Open =>
  withDecision(
    state,
    state.clocks.decision.pipe(
      Option.map((clock) =>
        DecisionClocks.$match(clock, {
          RunChoice: () => clock,
          Turn: (turn) =>
            DecisionClocks.Turn({
              ...turn,
              bankFrom: Option.some(turn.deadline),
              deadline,
            }),
        })
      )
    )
  );

const evolveOpen = (state: Open, event: RoomEvent): RoomState =>
  RoomEvents.$match(event, {
    BoughtIn: ({ amount, player, seat }) => ({
      ...state,
      entries: withEntry(state.entries, boughtIn(player, amount)),
      queued: withoutFirstChips(state.queued, player),
      table: evolveTable(
        state.table,
        Option.isSome(occupantAt(state.table, seat))
          ? Events.ChipsAdded({ amount, seat })
          : Events.PlayerSat({ buyIn: amount, player, seat })
      ),
    }),
    CashedOut: ({ amount, at, player, seat }) =>
      onTable(
        {
          ...state,
          entries: withEntry(state.entries, cashedOut(player, amount)),
        },
        Events.PlayerStood({ player, seat, stack: amount }),
        at
      ),
    ChipsApproved: ({ player }) => withoutChipRequest(state, player),
    ChipsDenied: ({ player }) => withoutChipRequest(state, player),
    ChipsQueued: ({ amount, player }) => ({
      ...withoutChipRequest(state, player),
      queued: {
        ...state.queued,
        chips: [...state.queued.chips, { amount, player }],
      },
    }),
    ChipsRequested: ({ amount, player }) => ({
      ...state,
      requests: {
        ...state.requests,
        chips: [...state.requests.chips, { amount, player }],
      },
    }),
    ClockStopped: () => withDecision(state, Option.none()),
    CloseQueued: () => ({
      ...state,
      queued: { ...state.queued, close: true },
    }),
    GamePaused: (): Open => ({ ...state, game: "Waiting" }),
    GameStarted: (): Open => ({ ...state, game: "Running" }),
    HostChanged: ({ host }) => ({ ...state, host }),
    LeaveQueued: ({ player }) => ({
      ...state,
      queued: {
        ...state.queued,
        leaving: [...state.queued.leaving, player],
      },
    }),
    MarkedAway: ({ seat }) => ({ ...state, away: [...state.away, seat] }),
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
    RoomClosed: ({ at, settlement }) =>
      RoomStates.Closed({
        code: state.code,
        entries: state.entries,
        members: state.members,
        now: at,
        settlement,
      }),
    RoomOpened: (opening) => opened(opening),
    RulesQueued: ({ config }) => ({
      ...state,
      queued: { ...state.queued, rules: Option.some(config) },
    }),
    RunClockStarted: ({ deadline }) =>
      withDecision(state, Option.some(DecisionClocks.RunChoice({ deadline }))),
    SeatApproved: ({ player }) => withoutSeatRequest(state, player),
    SeatDenied: ({ player }) => withoutSeatRequest(state, player),
    SeatRequested: ({ buyIn, player, seat }) => ({
      ...state,
      requests: {
        ...state.requests,
        seats: [...state.requests.seats, { buyIn, player, seat }],
      },
    }),
    SettingsChanged: ({ settings }) => ({ ...state, settings }),
    StraddleDeclared: ({ on, player }) => ({
      ...state,
      straddlers: on
        ? [...state.straddlers, player]
        : state.straddlers.filter((straddler) => straddler !== player),
    }),
    Table: ({ at, event: tableEvent }) => onTable(state, tableEvent, at),
    TimeBankSpent: ({ player, seconds }) => ({
      ...state,
      clocks: {
        ...state.clocks,
        bankSpent: new Map([
          ...state.clocks.bankSpent,
          [player, (state.clocks.bankSpent.get(player) ?? 0) + seconds],
        ]),
      },
    }),
    TimeBankStarted: ({ deadline }) => bankStarted(state, deadline),
    TurnClockStarted: ({ deadline, player, seat }) =>
      withDecision(
        state,
        Option.some(
          DecisionClocks.Turn({
            bankFrom: Option.none(),
            deadline,
            player,
            seat,
          })
        )
      ),
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
