import {
  Events,
  Seats,
  TableStates,
  evolve as evolveTable,
  initialTable,
} from "@nostakes/engine";
import type { Chips, Event, PlayerId, SeatIndex } from "@nostakes/engine";
import { Option } from "effect";

import { postingSeats } from "./dealing.js";
import { RoomEvents } from "./events.js";
import type { RoomEvent, RoomEventOf } from "./events.js";
import { boughtIn, cashedOut, withEntry } from "./money.js";
import { NO_RECAP, NO_TALLY, recapOf, tallied } from "./recap.js";
import { recorded } from "./record.js";
import { Audiences, redact } from "./redaction.js";
import { beaconOf, planOf } from "./sealed-hand.js";
import {
  Attendances,
  DecisionClocks,
  EMPTY_QUEUE,
  ProofDeals,
  RoomStates,
  occupantAt,
} from "./state.js";
import type {
  DecisionClock,
  Open,
  ProofDeal,
  Queue,
  RoomState,
  Sealed,
  SealedDeals,
} from "./state.js";
import { latest } from "./time.js";
import type { Millis } from "./time.js";

export const opened = (event: RoomEventOf<"RoomOpened">): Open =>
  RoomStates.Open({
    attendance: Attendances.Attended({ since: event.at }),
    away: [],
    chain: event.chain,
    clocks: {
      bankRefilled: new Map(),
      bankSpent: new Map(),
      decision: Option.none(),
      handsDealt: new Map(),
      lastHandEndedAt: Option.none(),
      timeoutsInARow: new Map(),
    },
    code: event.code,
    dealCalled: false,
    departed: [],
    entries: new Map(),
    game: "Waiting",
    handStacks: new Map(),
    host: event.host,
    hostAway: Option.none(),
    members: [],
    now: event.at,
    posters: [],
    proof: Option.none(),
    queued: EMPTY_QUEUE,
    record: Option.none(),
    removed: [],
    requests: { chips: [], seats: [] },
    sealed: Option.none(),
    sealedDeals: { fromBeacon: 0, withoutBeacon: 0 },
    settings: event.settings,
    stalled: Option.none(),
    straddlers: [],
    table: initialTable(event.settings.table),
    tally: NO_TALLY,
  });

const withoutStreak = (state: Open, player: PlayerId): Open => ({
  ...state,
  clocks: {
    ...state.clocks,
    timeoutsInARow: new Map(
      [...state.clocks.timeoutsInARow].filter(([owner]) => owner !== player)
    ),
  },
});

const vacated = (state: Open, player: PlayerId, seat: SeatIndex): Open => ({
  ...withoutStreak(state, player),
  away: state.away.filter((awaySeat) => awaySeat !== seat),
  posters: state.posters.filter((poster) => poster !== player),
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

const counted = (
  totals: ReadonlyMap<PlayerId, number>,
  player: PlayerId,
  more: number
) => new Map([...totals, [player, (totals.get(player) ?? 0) + more]]);

const dealtInto = (state: Open, seats: readonly SeatIndex[]): Open => {
  let { handsDealt } = state.clocks;

  for (const seat of seats) {
    for (const occupant of Option.toArray(occupantAt(state.table, seat))) {
      handsDealt = counted(handsDealt, occupant.player, 1);
    }
  }

  return { ...state, clocks: { ...state.clocks, handsDealt } };
};

const stacksOf = (
  state: Open,
  seats: readonly SeatIndex[]
): ReadonlyMap<SeatIndex, Chips> =>
  new Map(
    seats.flatMap((seat) =>
      Option.toArray(occupantAt(state.table, seat)).map(
        ({ stack }): readonly [SeatIndex, Chips] => [seat, stack]
      )
    )
  );

interface Restored {
  readonly seat: SeatIndex;
  readonly stack: Chips;
}

const cancelled = (state: Open, restored: readonly Restored[]): Open => {
  const { table } = state;

  if (!TableStates.$is("InHand")(table)) {
    return state;
  }

  const seats = table.seats.map((occupied, index) => {
    const back = restored.find(({ seat }) => seat === index);

    return back !== undefined && Seats.$is("Occupied")(occupied)
      ? { ...occupied, stack: back.stack }
      : occupied;
  });

  return {
    ...state,
    clocks: { ...state.clocks, decision: Option.none() },
    queued: { ...state.queued, chips: [] },
    record: Option.none(),
    table: TableStates.BetweenHands({
      button: Option.some(table.button),
      config: table.config,
      handNumber: table.handNumber,
      lastBlinds: Option.some({
        big: table.hand.bigBlindSeat,
        small: table.hand.smallBlindSeat,
      }),
      lastHand: Option.none(),
      seats,
    }),
  };
};

const proofFor = (state: Open, handNumber: number): Open =>
  Option.exists(state.proof, (proof) => proof.sealed.hand === handNumber)
    ? state
    : { ...state, proof: Option.none() };

const onTable = (state: Open, event: Event, at: Millis): Open => {
  const next = {
    ...(Events.$is("HandStarted")(event)
      ? {
          ...proofFor(dealtInto(state, event.dealtIn), event.handNumber),
          dealCalled: false,
          handStacks: stacksOf(state, event.dealtIn),
        }
      : state),
    record: recorded(state.record, event),
    table: evolveTable(state.table, event),
  };

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
          Showdown: () => clock,
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

const dealtFromSeal = (
  state: Open,
  deal: (sealed: Sealed) => ProofDeal
): Open =>
  Option.match(state.sealed, {
    onNone: () => state,
    onSome: (sealed) => ({
      ...state,
      proof: Option.some({ deal: deal(sealed), opened: [], sealed }),
      sealed: Option.none(),
    }),
  });

const countedDeal = (state: Open, kind: keyof SealedDeals): Open =>
  Option.isSome(state.sealed)
    ? {
        ...state,
        sealedDeals: {
          ...state.sealedDeals,
          [kind]: state.sealedDeals[kind] + 1,
        },
      }
    : state;

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
    CardsOpened: ({ holder, openings }) => ({
      ...state,
      proof: state.proof.pipe(
        Option.map((proof) => ({
          ...proof,
          opened: [
            ...proof.opened,
            ...openings.map((card) => ({ card, holder })),
          ],
        }))
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
    DealtFromBeacon: ({ round, signature, spare }) =>
      dealtFromSeal(countedDeal(state, "fromBeacon"), (sealed) =>
        ProofDeals.FromBeacon({
          plan: planOf(state.code, sealed, beaconOf(round, signature)),
          round,
          signature,
          spare,
        })
      ),
    DealtWithoutBeacon: ({ at, reason }) =>
      dealtFromSeal(countedDeal(state, "withoutBeacon"), () =>
        ProofDeals.WithoutBeacon({ at, reason })
      ),
    GamePaused: (): Open => ({ ...state, dealCalled: false, game: "Waiting" }),
    GameStarted: (): Open => ({ ...state, game: "Running" }),
    HandCancelled: ({ restored }) => cancelled(state, restored),
    HandSealed: ({ at, decks, hand, roots, round, seats, secret }) => ({
      ...state,
      sealed: Option.some({
        at,
        decks,
        hand,
        posts: postingSeats(state),
        roots,
        round,
        seats,
        secret,
      }),
    }),
    HostAway: ({ at }): Open => ({ ...state, hostAway: Option.some(at) }),
    HostBack: (): Open => ({ ...state, hostAway: Option.none() }),
    HostChanged: ({ host }): Open => ({
      ...state,
      host,
      hostAway: Option.none(),
    }),
    LeaveQueued: ({ player }) => ({
      ...state,
      queued: {
        ...state.queued,
        leaving: [...state.queued.leaving, player],
      },
    }),
    MarkedAway: ({ seat }) => {
      const streakEnded = Option.match(occupantAt(state.table, seat), {
        onNone: () => state,
        onSome: ({ player }) => withoutStreak(state, player),
      });

      return { ...streakEnded, away: [...state.away, seat] };
    },
    MemberJoined: ({ at, avatar, name, player }) => ({
      ...state,
      departed: state.departed.filter((member) => member.player !== player),
      members: [...state.members, { avatar, joinedAt: at, name, player }],
    }),
    MemberLeft: ({ player }) => ({
      ...state,
      departed: [
        ...state.departed.filter((member) => member.player !== player),
        ...state.members.filter((member) => member.player === player),
      ],
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
    MemberRemoved: ({ player }) => ({
      ...state,
      departed: state.departed.filter((member) => member.player !== player),
      members: state.members.filter((member) => member.player !== player),
      removed: [
        ...state.removed,
        ...[...state.members, ...state.departed].filter(
          (member) => member.player === player
        ),
      ],
      requests: {
        chips: state.requests.chips.filter(
          (request) => request.player !== player
        ),
        seats: state.requests.seats.filter(
          (request) => request.player !== player
        ),
      },
    }),
    NextHandCalled: (): Open => ({ ...state, dealCalled: true }),
    PostingChosen: ({ player, post }) => ({
      ...state,
      posters: post
        ? [...state.posters, player]
        : state.posters.filter((poster) => poster !== player),
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
        departed: state.departed,
        entries: state.entries,
        members: state.members,
        now: at,
        recap: NO_RECAP,
        removed: state.removed,
        settlement,
      }),
    RoomOpened: (opening) => opened(opening),
    RulesQueued: ({ config }) => ({
      ...state,
      queued: { ...state.queued, rules: Option.some(config) },
    }),
    RunClockStarted: ({ at, deadline }) =>
      withDecision(
        state,
        Option.some(DecisionClocks.RunChoice({ deadline, startedAt: at }))
      ),
    SealWithdrawn: () => ({ ...state, sealed: Option.none() }),
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
    ShowdownClockStarted: ({ at, deadline, seat }) =>
      withDecision(
        state,
        Option.some(DecisionClocks.Showdown({ deadline, seat, startedAt: at }))
      ),
    StallCleared: (): Open => ({ ...state, stalled: Option.none() }),
    StraddleDeclared: ({ on, player }) => ({
      ...state,
      straddlers: on
        ? [...state.straddlers, player]
        : state.straddlers.filter((straddler) => straddler !== player),
    }),
    Table: ({ at, event: tableEvent }) => onTable(state, tableEvent, at),
    TableAttended: ({ at }): Open => ({
      ...state,
      attendance: Attendances.Attended({ since: at }),
    }),
    TableStalled: ({ at, deadline }): Open => ({
      ...state,
      stalled: Option.some({ deadline, since: at }),
    }),
    TableUnattended: ({ at }): Open => ({
      ...state,
      attendance: Attendances.Unattended({ since: at }),
    }),
    TableWentQuiet: ({ at }): Open => ({
      ...state,
      attendance: Attendances.Quiet({
        pausedAt: at,
        since: Attendances.$is("Unattended")(state.attendance)
          ? state.attendance.since
          : at,
      }),
    }),
    TimeBankRefilled: ({ player, seconds }) => ({
      ...state,
      clocks: {
        ...state.clocks,
        bankRefilled: counted(state.clocks.bankRefilled, player, seconds),
      },
    }),
    TimeBankSpent: ({ player, seconds }) => ({
      ...state,
      clocks: {
        ...state.clocks,
        bankSpent: counted(state.clocks.bankSpent, player, seconds),
      },
    }),
    TimeBankStarted: ({ deadline }) => bankStarted(state, deadline),
    TimedOut: ({ player }) => ({
      ...state,
      clocks: {
        ...state.clocks,
        timeoutsInARow: counted(state.clocks.timeoutsInARow, player, 1),
      },
    }),
    TimeoutStreakEnded: ({ player }) => withoutStreak(state, player),
    TurnClockStarted: ({ at, deadline, player, seat }) =>
      withDecision(
        state,
        Option.some(
          DecisionClocks.Turn({
            bankFrom: Option.none(),
            deadline,
            player,
            seat,
            startedAt: at,
          })
        )
      ),
  });

export const evolveWithoutRecap = (
  state: RoomState,
  event: RoomEvent
): RoomState =>
  RoomStates.$match(state, {
    Closed: (closed) => closed,
    Open: (open) =>
      evolveOpen({ ...open, now: latest(open.now, event.at) }, event),
  });

const tallying = (state: RoomState, event: RoomEvent): RoomState =>
  RoomStates.$match(state, {
    Closed: (closed): RoomState => closed,
    Open: (open): RoomState => ({
      ...open,
      tally: tallied(open.tally, redact(event, Audiences.Spectator())),
    }),
  });

const withRecap = (before: RoomState, after: RoomState): RoomState =>
  RoomStates.$match(before, {
    Closed: (): RoomState => after,
    Open: (open): RoomState =>
      RoomStates.$match(after, {
        Closed: (closed): RoomState => ({
          ...closed,
          recap: recapOf(open.tally, open.settings.moments),
        }),
        Open: (): RoomState => after,
      }),
  });

export const evolve = (state: RoomState, event: RoomEvent): RoomState => {
  const withTally = tallying(state, event);

  return withRecap(withTally, evolveWithoutRecap(withTally, event));
};

export const evolveAllWithoutRecap = (
  state: RoomState,
  events: readonly RoomEvent[]
) => {
  let current = state;

  for (const event of events) {
    current = evolveWithoutRecap(current, event);
  }

  return current;
};

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

export const replayWithoutRecap = ([first, ...rest]: RoomLog) =>
  evolveAllWithoutRecap(opened(first), rest);
