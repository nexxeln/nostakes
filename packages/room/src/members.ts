import type { PlayerId } from "@nostakes/engine";
import { Option, Result } from "effect";

import type { RoomCommandOf } from "./commands.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import type { RoomEvent } from "./events.js";
import { leaveSeat } from "./money.js";
import {
  AlreadyAMember,
  AlreadyTheHost,
  HostStillHere,
  NotAMember,
} from "./rejection.js";
import { SEATS, isMember, occupantAt, seatOf } from "./state.js";
import type { Open } from "./state.js";
import { secondsAfter } from "./time.js";
import type { Millis } from "./time.js";

export const HOST_CLAIM_AFTER_SECONDS = 120;

export const hostClaimableAt = (state: Open): Option.Option<Millis> =>
  state.hostAway.pipe(
    Option.map((since) => secondsAfter(since, HOST_CLAIM_AFTER_SECONDS))
  );

export const claimHost = (
  state: Open,
  player: PlayerId,
  at: Millis
): Decision => {
  if (player === state.host) {
    return Result.fail(new AlreadyTheHost({ player }));
  }

  const claimable = hostClaimableAt(state);

  return Option.exists(claimable, (from) => at >= from)
    ? Result.succeed([RoomEvents.HostChanged({ at, host: player })])
    : Result.fail(
        new HostStillHere({ claimableAt: claimable, host: state.host })
      );
};

export const joinRoom = (
  state: Open,
  player: PlayerId,
  command: RoomCommandOf<"Join">
) => {
  if (isMember(state, player)) {
    return Result.fail(new AlreadyAMember({ player }));
  }

  const joined = RoomEvents.MemberJoined({
    at: command.at,
    avatar: command.avatar,
    name: command.name,
    player,
  });

  const takesOver = state.members.length === 0 && state.host !== player;

  return Result.succeed(
    takesOver
      ? [RoomEvents.HostChanged({ at: command.at, host: player }), joined]
      : [joined]
  );
};

export const setProfile = (
  player: PlayerId,
  command: RoomCommandOf<"SetProfile">
) =>
  Result.succeed([
    RoomEvents.ProfileChanged({
      at: command.at,
      avatar: command.avatar,
      name: command.name,
      player,
    }),
  ]);

export const successorTo = (state: Open, leaving: PlayerId) => {
  const stays = (player: PlayerId) =>
    player !== leaving && isMember(state, player);

  const seated = SEATS.flatMap((seat) =>
    Option.match(occupantAt(state.table, seat), {
      onNone: () => [],
      onSome: (occupant) => (stays(occupant.player) ? [occupant.player] : []),
    })
  );

  const earliest = state.members.find((member) => stays(member.player));

  return Option.fromUndefinedOr(seated[0] ?? earliest?.player);
};

export const handOffHost = (
  state: Open,
  leaving: PlayerId,
  at: Millis
): readonly RoomEvent[] =>
  state.host === leaving
    ? Option.match(successorTo(state, leaving), {
        onNone: () => [],
        onSome: (host) => [RoomEvents.HostChanged({ at, host })],
      })
    : [];

const standIfSeated = (state: Open, player: PlayerId, at: Millis) =>
  Option.isSome(seatOf(state, player)) && !state.queued.leaving.includes(player)
    ? leaveSeat(state, player, at)
    : Result.succeed([]);

export const leaveRoom = (state: Open, player: PlayerId, at: Millis) => {
  const departing: readonly RoomEvent[] = [
    ...handOffHost(state, player, at),
    RoomEvents.MemberLeft({ at, player }),
  ];

  return Result.map(standIfSeated(state, player, at), (stood) => [
    ...stood,
    ...departing,
  ]);
};

export const transferHost = (
  state: Open,
  command: RoomCommandOf<"TransferHost">
) => {
  if (!isMember(state, command.to)) {
    return Result.fail(new NotAMember({ player: command.to }));
  }

  return command.to === state.host
    ? Result.fail(new AlreadyTheHost({ player: command.to }))
    : Result.succeed([
        RoomEvents.HostChanged({ at: command.at, host: command.to }),
      ]);
};
