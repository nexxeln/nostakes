import type { PlayerId } from "@nostakes/engine";
import { Option, Result } from "effect";

import type { RoomCommandOf } from "./commands.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import type { KnockOutcome, RoomEvent } from "./events.js";
import {
  NoKnockDue,
  NotKnocking,
  TooManyKnocking,
  TooManyKnocks,
} from "./rejection.js";
import { waitingKnocks } from "./state.js";
import type { Knock, Open } from "./state.js";
import { earliest } from "./time.js";
import type { Millis } from "./time.js";

export const MOST_WAITING = 3;

export const MOST_KNOCKS = 100;

export const knock = (
  state: Open,
  player: PlayerId,
  command: RoomCommandOf<"Join">
): Decision => {
  if (waitingKnocks(state).length >= MOST_WAITING) {
    return Result.fail(new TooManyKnocking({ most: MOST_WAITING }));
  }

  if (state.knocks.length >= MOST_KNOCKS) {
    return Result.fail(new TooManyKnocks({ most: MOST_KNOCKS }));
  }

  return Result.succeed([
    RoomEvents.Knocked({
      at: command.at,
      avatar: command.avatar,
      name: command.name,
      player,
    }),
  ]);
};

export const waitingKnock = (
  state: Open,
  player: PlayerId
): Result.Result<Knock, NotKnocking> =>
  Option.match(
    Option.fromUndefinedOr(
      waitingKnocks(state).find((waiting) => waiting.player === player)
    ),
    {
      onNone: () => Result.fail(new NotKnocking({ player })),
      onSome: (waiting) => Result.succeed(waiting),
    }
  );

export const answered = (
  player: PlayerId,
  at: Millis,
  outcome: KnockOutcome
): RoomEvent => RoomEvents.KnockAnswered({ at, outcome, player });

export const turnAway = (
  state: Open,
  command: RoomCommandOf<"TurnAway">
): Decision =>
  Result.map(waitingKnock(state, command.player), ({ player }) => [
    answered(player, command.at, "TurnedAway"),
  ]);

export const nextLapse = (state: Open): Option.Option<Millis> => {
  let soonest: Option.Option<Millis> = Option.none();

  for (const { lapsesAt } of waitingKnocks(state)) {
    soonest = Option.some(
      Option.match(soonest, {
        onNone: () => lapsesAt,
        onSome: (before) => earliest(before, lapsesAt),
      })
    );
  }

  return soonest;
};

export const lapseKnocks = (state: Open, at: Millis): Decision => {
  const lapsed = waitingKnocks(state).filter(({ lapsesAt }) => lapsesAt <= at);

  return lapsed.length === 0
    ? Result.fail(new NoKnockDue({ next: nextLapse(state) }))
    : Result.succeed(
        lapsed.map(({ player }) => answered(player, at, "Lapsed"))
      );
};

export const lockedOut = (state: Open, at: Millis): readonly RoomEvent[] =>
  state.settings.locked
    ? waitingKnocks(state).map(({ player }) => answered(player, at, "Locked"))
    : [];
