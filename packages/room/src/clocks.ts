import {
  Actions,
  Commands,
  Events,
  PendingDecisions,
  pendingDecisions,
  RunCountSchema,
  SeatIndexSchema,
  TableStates,
} from "@nostakes/engine";
import type { Command, Event, PlayerId, SeatIndex } from "@nostakes/engine";
import { BeaconRoundSchema } from "@nostakes/shuffle";
import { Data, Option, Result, Schema } from "effect";

import { andThen } from "./batch.js";
import type { RoomCommandOf } from "./commands.js";
import { dealDue } from "./dealing.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import type { RoomEvent } from "./events.js";
import { ActionNotOnSeat, ClockNotDue, NoSuchDeadline } from "./rejection.js";
import { sealDue, sealedDealDue } from "./sealing.js";
import { TimeBankRefills, turnClockRuns } from "./settings.js";
import {
  DecisionClocks,
  RoomStates,
  heldSeat,
  occupantAt,
  queueWaiting,
} from "./state.js";
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
  QueueDue: { at: MillisSchema },
  RunChoiceClock: { at: MillisSchema },
  SealDue: { at: MillisSchema },
  SealedDealDue: { at: MillisSchema, round: BeaconRoundSchema },
  ShowdownClock: { at: MillisSchema, seat: SeatIndexSchema },
  TurnClock: { at: MillisSchema, seat: SeatIndexSchema },
});

export type Deadline = typeof DeadlineSchema.Type;

export const Deadlines = Data.taggedEnum<Deadline>();

const dealingDeadline = (state: Open): Option.Option<Deadline> =>
  sealedDealDue(state).pipe(
    Option.map(({ at, round }): Deadline =>
      Deadlines.SealedDealDue({ at, round })
    ),
    Option.orElse(() =>
      state.settings.shuffle === "Checked"
        ? Option.map(sealDue(state), (at): Deadline =>
            Deadlines.SealDue({ at })
          )
        : Option.map(dealDue(state), (at): Deadline =>
            Deadlines.DealDue({ at })
          )
    )
  );

export const nextDealAt = (state: Open): Option.Option<Millis> =>
  sealedDealDue(state).pipe(
    Option.map(({ at }) => at),
    Option.orElse(() => dealDue(state))
  );

export const nextDeadline = (state: RoomState): Option.Option<Deadline> =>
  RoomStates.$match(state, {
    Closed: () => Option.none(),
    Open: (open) =>
      Option.match(open.clocks.decision, {
        onNone: () =>
          queueWaiting(open)
            ? Option.some(Deadlines.QueueDue({ at: open.now }))
            : dealingDeadline(open),
        onSome: (clock) =>
          Option.some(
            DecisionClocks.$match(clock, {
              RunChoice: ({ deadline }) =>
                Deadlines.RunChoiceClock({ at: deadline }),
              Showdown: ({ deadline, seat }) =>
                Deadlines.ShowdownClock({ at: deadline, seat }),
              Turn: ({ deadline, seat }) =>
                Deadlines.TurnClock({ at: deadline, seat }),
            })
          ),
      }),
  });

const ONE_RUN = RunCountSchema.make(1);

export const timeBankLeft = (state: Open, player: PlayerId) =>
  Math.max(
    0,
    state.settings.timeBankSeconds +
      (state.clocks.bankRefilled.get(player) ?? 0) -
      (state.clocks.bankSpent.get(player) ?? 0)
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
        ? Option.some(Commands.ChooseRuns({ runs: ONE_RUN, seat }))
        : Option.none(),
    Nothing: () => Option.none(),
    Show: ({ beatenInEveryPot, choices }) =>
      choices.seat === seat
        ? Option.some(
            beatenInEveryPot
              ? Commands.MuckHand({ seat })
              : Commands.TableHand({ seat })
          )
        : Option.none(),
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

export const timeoutsInARow = (state: Open, player: PlayerId) =>
  state.clocks.timeoutsInARow.get(player) ?? 0;

const sitsOutNow = (state: Open, player: PlayerId) => {
  const limit = state.settings.sitOutAfterTimeouts;

  return limit > 0 && timeoutsInARow(state, player) + 1 >= limit;
};

const sitOutAway = (state: Open, seat: SeatIndex, at: Millis): Decision =>
  Result.map(
    onTable(
      state.table,
      Commands.SetSittingOut({ seat, sittingOut: true }),
      at
    ),
    (satOut) =>
      state.away.includes(seat)
        ? satOut
        : [...satOut, RoomEvents.MarkedAway({ at, seat })]
  );

const timeOut = (
  state: Open,
  seat: SeatIndex,
  player: PlayerId,
  at: Millis
): Decision =>
  andThen(
    state,
    Option.getOrElse(actAutomatically(state, seat, at), () =>
      Result.succeed([])
    ),
    (acted) =>
      sitsOutNow(acted, player)
        ? sitOutAway(acted, seat, at)
        : Result.succeed([RoomEvents.TimedOut({ at, player, seat })])
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
              Commands.ChooseRuns({ runs: ONE_RUN, seat: first }),
              at
            ),
            (after) => chooseOneRunForAll(after, at)
          );
    },
    Nothing: () => Result.succeed([]),
    Show: () => Result.succeed([]),
  });

const expire = (state: Open, clock: DecisionClock, at: Millis): Decision =>
  DecisionClocks.$match(clock, {
    RunChoice: () => chooseOneRunForAll(state, at),
    Showdown: ({ seat }) =>
      Option.getOrElse(actAutomatically(state, seat, at), () =>
        Result.succeed([])
      ),
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
        : timeOut(state, seat, player, at);
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
        Showdown: () => [],
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

const stopped = (
  current: DecisionClock | undefined,
  at: Millis
): Option.Option<readonly RoomEvent[]> =>
  current === undefined
    ? Option.none()
    : Option.some([RoomEvents.ClockStopped({ at })]);

const wantedClock = (
  after: Open,
  moved: boolean,
  at: Millis
): Option.Option<readonly RoomEvent[]> => {
  const current = Option.getOrUndefined(after.clocks.decision);

  return PendingDecisions.$match(pendingDecisions(after.table), {
    Bet: ({ legal }) => {
      if (!turnClockRuns(after.settings)) {
        return stopped(current, at);
      }

      return !moved &&
        current !== undefined &&
        DecisionClocks.$is("Turn")(current) &&
        current.seat === legal.seat
        ? Option.none()
        : Option.some(turnClockFor(after, legal.seat, at));
    },
    ChooseRuns: () =>
      current !== undefined && DecisionClocks.$is("RunChoice")(current)
        ? Option.none()
        : Option.some([
            RoomEvents.RunClockStarted({
              at,
              deadline: secondsAfter(at, after.settings.runChoiceSeconds),
            }),
          ]),
    Nothing: () => stopped(current, at),
    Show: ({ choices }) =>
      current !== undefined &&
      DecisionClocks.$is("Showdown")(current) &&
      current.seat === choices.seat
        ? Option.none()
        : Option.some([
            RoomEvents.ShowdownClockStarted({
              at,
              deadline: secondsAfter(at, after.settings.showdownSeconds),
              seat: choices.seat,
            }),
          ]),
  });
};

export const timeBankUsed = (
  before: Open,
  after: Open,
  events: readonly RoomEvent[],
  at: Millis
): readonly RoomEvent[] =>
  events.some(movesTheAction) ||
  !turnClockRuns(after.settings) ||
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

const endsAHand = (event: RoomEvent) =>
  RoomEvents.$is("Table")(event) && Events.$is("HandEnded")(event.event);

export const timeBankRefills = (
  after: Open,
  events: readonly RoomEvent[],
  at: Millis
): readonly RoomEvent[] =>
  TimeBankRefills.$match(after.settings.timeBankRefill, {
    NoRefill: () => [],
    Refill: ({ everyHands, seconds, upTo }) =>
      events.some(endsAHand) && TableStates.$is("BetweenHands")(after.table)
        ? Option.toArray(after.table.lastHand).flatMap((lastHand) =>
            lastHand.players.flatMap(({ player }) => {
              const dealt = after.clocks.handsDealt.get(player) ?? 0;
              const room = upTo - timeBankLeft(after, player);
              const added = Math.min(seconds, room);

              return dealt % everyHands === 0 && added > 0
                ? [RoomEvents.TimeBankRefilled({ at, player, seconds: added })]
                : [];
            })
          )
        : [],
  });
