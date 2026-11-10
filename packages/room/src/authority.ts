import type { PlayerId } from "@nostakes/engine";
import { Result } from "effect";

import type { RoomCommand } from "./commands.js";
import { Actors } from "./identity.js";
import {
  MembersOnly,
  NotAMember,
  NotTheHost,
  ServerOnly,
} from "./rejection.js";
import { isMember } from "./state.js";
import type { Open } from "./state.js";

export const fromSomeone = (command: RoomCommand) =>
  Actors.$match(command.by, {
    Member: ({ player }) => Result.succeed(player),
    Server: () => Result.fail(new MembersOnly({ command: command._tag })),
  });

export const fromMember = (state: Open, command: RoomCommand) =>
  Result.flatMap(fromSomeone(command), (player) =>
    isMember(state, player)
      ? Result.succeed(player)
      : Result.fail(new NotAMember({ player }))
  );

export const fromHost = (state: Open, command: RoomCommand) =>
  Result.flatMap(
    fromMember(state, command),
    (player): Result.Result<PlayerId, NotAMember | NotTheHost | MembersOnly> =>
      player === state.host
        ? Result.succeed(player)
        : Result.fail(new NotTheHost({ host: state.host, player }))
  );

export const fromServer = (command: RoomCommand) =>
  Actors.$match(command.by, {
    Member: () => Result.fail(new ServerOnly({ command: command._tag })),
    Server: () => Result.succeed(command.at),
  });
