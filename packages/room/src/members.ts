import type { PlayerId } from "@nostakes/engine";
import { Option, Result } from "effect";

import { inSequence } from "./batch.js";
import type { Step } from "./batch.js";
import { RoomCommands } from "./commands.js";
import type { RoomCommandOf } from "./commands.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import type { RoomEvent } from "./events.js";
import { Actors } from "./identity.js";
import { leaveSeat } from "./money.js";
import { sameName } from "./names.js";
import {
  AlreadyAMember,
  AlreadyRemoved,
  AlreadyTheHost,
  HostStillHere,
  NameTaken,
  NobodyToClear,
  NotAMember,
  RemovedFromRoom,
  RemovingYourself,
  RoomLocked,
  TooManyPeople,
} from "./rejection.js";
import {
  SEATS,
  isMember,
  isRemoved,
  namedPeople,
  occupantAt,
  seatOf,
} from "./state.js";
import type { Open } from "./state.js";
import { secondsAfter } from "./time.js";
import type { Millis } from "./time.js";

export const HOST_CLAIM_AFTER_SECONDS = 120;

export const MOST_PEOPLE = 20;

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

const nameHeldByAnother = (state: Open, player: PlayerId, name: string) =>
  namedPeople(state).some(
    (holder) => holder.player !== player && sameName(holder.name, name)
  );

export const joinRoom = (
  state: Open,
  player: PlayerId,
  command: RoomCommandOf<"Join">
): Decision => {
  if (isMember(state, player)) {
    return Result.fail(new AlreadyAMember({ player }));
  }

  if (isRemoved(state, player)) {
    return Result.fail(new RemovedFromRoom({ player }));
  }

  const returning = state.departed.some((member) => member.player === player);

  if (state.settings.locked && !returning) {
    return Result.fail(new RoomLocked({ code: state.code }));
  }

  const people = state.members.length + state.departed.length;

  if (!returning && people >= MOST_PEOPLE) {
    return Result.fail(new TooManyPeople({ most: MOST_PEOPLE, people }));
  }

  if (nameHeldByAnother(state, player, command.name)) {
    return Result.fail(new NameTaken({ wanted: command.name }));
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
  state: Open,
  player: PlayerId,
  command: RoomCommandOf<"SetProfile">
): Decision =>
  nameHeldByAnother(state, player, command.name)
    ? Result.fail(new NameTaken({ wanted: command.name }))
    : Result.succeed([
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

export const removeMember = (
  state: Open,
  host: PlayerId,
  command: RoomCommandOf<"RemoveMember">
): Decision => {
  const { at, player } = command;

  if (player === host) {
    return Result.fail(new RemovingYourself({ player }));
  }

  if (isRemoved(state, player)) {
    return Result.fail(new AlreadyRemoved({ player }));
  }

  if (
    !isMember(state, player) &&
    !state.departed.some((member) => member.player === player)
  ) {
    return Result.fail(new NotAMember({ player }));
  }

  return Result.map(standIfSeated(state, player, at), (stood) => [
    ...stood,
    RoomEvents.MemberRemoved({ at, player }),
  ]);
};

export const clearable = (state: Open, host: PlayerId): readonly PlayerId[] => [
  ...state.members
    .filter(
      ({ player }) => player !== host && Option.isNone(seatOf(state, player))
    )
    .map(({ player }) => player),
  ...state.departed
    .filter(({ player }) => !state.entries.has(player))
    .map(({ player }) => player),
];

const lockedNow = (state: Open, at: Millis): Decision =>
  Result.succeed(
    state.settings.locked
      ? []
      : [
          RoomEvents.SettingsChanged({
            at,
            settings: { ...state.settings, locked: true },
          }),
        ]
  );

export const clearRoom = (
  state: Open,
  host: PlayerId,
  at: Millis
): Decision => {
  const targets = clearable(state, host);

  if (targets.length === 0) {
    return Result.fail(new NobodyToClear({ members: state.members.length }));
  }

  return inSequence(state, [
    ...targets.map(
      (player): Step =>
        (current) =>
          removeMember(
            current,
            host,
            RoomCommands.RemoveMember({
              at,
              by: Actors.Member({ player: host }),
              player,
            })
          )
    ),
    (current) => lockedNow(current, at),
  ]);
};
