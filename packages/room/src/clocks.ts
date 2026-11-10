import {
  Actions,
  Commands,
  Events,
  PendingDecisions,
  SeatIndexSchema,
  pendingDecisions,
} from "@nostakes/engine";
import type { Command, Event, PlayerId, SeatIndex } from "@nostakes/engine";
import { Data, Option, Result, Schema } from "effect";

import { andThen } from "./batch.js";
import type { RoomCommandOf } from "./commands.js";
import { dealDue } from "./dealing.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import type { RoomEvent } from "./events.js";
import { ActionNotOnSeat, ClockNotDue, NoSuchDeadline } from "./rejection.js";
import { clockRuns } from "./settings.js";
import { DecisionClocks, RoomStates, heldSeat, occupantAt } from "./state.js";
import type { DecisionClock, Open, RoomState } from "./state.js";
import { onTable } from "./table.js";
import {
  MillisSchema,
  earliest,
  secondsAfter,
  wholeSecondsBetween,
} from "./time.js";
import type { Millis } from "./time.js";

export const DeadlineSchema = Schema.TaggedUnion({
  DealDue: { at: MillisSchema },
  RunChoiceClock: { at: MillisSchema },
  TurnClock: { at: MillisSchema, seat: SeatIndexSchema },
});

export type Deadline = typeof DeadlineSchema.Type;

export const Deadlines = Data.taggedEnum<Deadline>();

export const nextDeadline = (state: RoomState): Option.Option<Deadline> =>
  RoomStates.$match(state, {
    Closed: () => Option.none(),
    Open: (open) =>
      Option.match(open.clocks.decision, {
        onNone: () =>
          Option.map(dealDue(open), (at) => Deadlines.DealDue({ at })),
        onSome: (clock) =>
          Option.some(
            DecisionClocks.$match(clock, {
              RunChoice: ({ deadline }) =>
                Deadlines.RunChoiceClock({ at: deadline }),
              Turn: ({ deadline, seat }) =>
                Deadlines.TurnClock({ at: deadline, seat }),
            })
          ),
      }),
  });

export const timeBankLeft = (state: Open, player: PlayerId) =>
  Math.max(
    0,
    state.settings.timeBankSeconds - (state.clocks.bankSpent.get(player) ?? 0)
  );

export const automaticFor = (
  state: Open,
  seat: SeatIndex
): Option.Option<Command> =>
  PendingDecisions.$match(pendingDecisions(state.table), {
    Bet: ({ legal }) =>
      legal.seat === seat
        ? Option.some(
            Commands.Act({
              action: legal.canCheck ? Actions.Check() : Actions.Fold(),
              seat,
            })
          )
        : Option.none(),
    ChooseRuns: ({ seats }) =>
      seats.includes(seat)
        ? Option.some(Commands.ChooseRuns({ runs: 1, seat }))
        : Option.none(),
    Nothing: () => Option.none(),
  });

export const actAutomatically = (
  state: Open,
  seat: SeatIndex,
  at: Millis
): Option.Option<Decision> =>
  Option.map(automaticFor(state, seat), (command) =>
    onTable(state.table, command, at)
  );

export const actForSeat = (
  state: Open,
  command: RoomCommandOf<"ActForSeat">
): Decision =>
  Result.flatMap(heldSeat(state, command.player), (seat) =>
    Option.getOrElse(actAutomatically(state, seat, command.at), () =>
      Result.fail(new ActionNotOnSeat({ player: command.player }))
    )
  );

const timeOut = (state: Open, seat: SeatIndex, at: Millis): Decision =>
  andThen(
    state,
    Option.getOrElse(actAutomatically(state, seat, at), () =>
      Result.succeed([])
    ),
    (acted) =>
      Result.map(
        onTable(
          acted.table,
          Commands.SetSittingOut({ seat, sittingOut: true }),
          at
        ),
        (satOut) =>
          acted.away.includes(seat)
            ? satOut
            : [...satOut, RoomEvents.MarkedAway({ at, seat })]
      )
  );

const chooseOneRunForAll = (state: Open, at: Millis): Decision =>
  PendingDecisions.$match(pendingDecisions(state.table), {
    Bet: () => Result.succeed([]),
    ChooseRuns: ({ seats }) => {
      const [first] = seats;

      return first === undefined
        ? Result.succeed([])
        : andThen(
            state,
            onTable(
              state.table,
              Commands.ChooseRuns({ runs: 1, seat: first }),
              at
            ),
            (after) => chooseOneRunForAll(after, at)
          );
    },
    Nothing: () => Result.succeed([]),
  });

const expire = (state: Open, clock: DecisionClock, at: Millis): Decision =>
  DecisionClocks.$match(clock, {
    RunChoice: () => chooseOneRunForAll(state, at),
    Turn: ({ bankFrom, deadline, player, seat }) => {
      const left = timeBankLeft(state, player);

      return Option.isNone(bankFrom) && left > 0
        ? Result.succeed([
            RoomEvents.TimeBankStarted({
              at,
              deadline: secondsAfter(deadline, left),
              player,
            }),
          ])
        : timeOut(state, seat, at);
    },
  });

export const expireClock = (
  state: Open,
  command: RoomCommandOf<"ExpireClock">
): Decision => {
  const clock = state.clocks.decision.pipe(
    Option.filter((current) => current.deadline === command.deadline)
  );

  if (Option.isNone(clock)) {
    return Result.fail(new NoSuchDeadline({ deadline: command.deadline }));
  }

  return command.at < command.deadline
    ? Result.fail(
        new ClockNotDue({ at: command.at, deadline: command.deadline })
      )
    : expire(state, clock.value, command.at);
};

const MOVES_THE_ACTION: readonly ((event: Event) => boolean)[] = [
  Events.$is("HandStarted"),
  Events.$is("Checked"),
  Events.$is("Called"),
  Events.$is("RaisedTo"),
  Events.$is("Folded"),
  Events.$is("StreetDealt"),
  Events.$is("HandEnded"),
];

const movesTheAction = (event: RoomEvent) =>
  RoomEvents.$is("Table")(event) &&
  MOVES_THE_ACTION.some((moves) => moves(event.event));

const bankSpent = (
  before: Open,
  after: Open,
  at: Millis
): readonly RoomEvent[] =>
  Option.match(before.clocks.decision, {
    onNone: () => [],
    onSome: (clock) =>
      DecisionClocks.$match(clock, {
        RunChoice: () => [],
        Turn: ({ bankFrom, deadline, player }) =>
          Option.match(bankFrom, {
            onNone: () => [],
            onSome: (from) => [
              RoomEvents.TimeBankSpent({
                at,
                player,
                seconds: Math.min(
                  timeBankLeft(after, player),
                  wholeSecondsBetween(from, earliest(at, deadline))
                ),
              }),
            ],
          }),
      }),
  });

const turnClockFor = (after: Open, seat: SeatIndex, at: Millis) =>
  Option.match(occupantAt(after.table, seat), {
    onNone: () => [],
    onSome: (occupant) => [
      RoomEvents.TurnClockStarted({
        at,
        deadline: secondsAfter(at, after.settings.turnSeconds),
        player: occupant.player,
        seat,
      }),
    ],
  });

const wantedClock = (
  after: Open,
  moved: boolean,
  at: Millis
): Option.Option<readonly RoomEvent[]> => {
  const current = Option.getOrUndefined(after.clocks.decision);

  if (!clockRuns(after.settings)) {
    return current === undefined
      ? Option.none()
      : Option.some([RoomEvents.ClockStopped({ at })]);
  }

  return PendingDecisions.$match(pendingDecisions(after.table), {
    Bet: ({ legal }) =>
      !moved &&
      current !== undefined &&
      DecisionClocks.$is("Turn")(current) &&
      current.seat === legal.seat
        ? Option.none()
        : Option.some(turnClockFor(after, legal.seat, at)),
    ChooseRuns: () =>
      current !== undefined && DecisionClocks.$is("RunChoice")(current)
        ? Option.none()
        : Option.some([
            RoomEvents.RunClockStarted({
              at,
              deadline: secondsAfter(at, after.settings.runChoiceSeconds),
            }),
          ]),
    Nothing: () =>
      current === undefined
        ? Option.none()
        : Option.some([RoomEvents.ClockStopped({ at })]),
  });
};

export const timeBankUsed = (
  before: Open,
  after: Open,
  events: readonly RoomEvent[],
  at: Millis
): readonly RoomEvent[] =>
  events.some(movesTheAction) ||
  !clockRuns(after.settings) ||
  Option.isNone(after.clocks.decision)
    ? bankSpent(before, after, at)
    : [];

export const clockEvents = (
  after: Open,
  events: readonly RoomEvent[],
  at: Millis
): readonly RoomEvent[] =>
  Option.getOrElse(
    wantedClock(after, events.some(movesTheAction), at),
    () => []
  );
