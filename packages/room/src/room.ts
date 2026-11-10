import type { PlayerId } from "@nostakes/engine";
import { PlayerIdSchema } from "@nostakes/engine";
import { Result, Schema } from "effect";

import { fromHost, fromMember, fromSomeone } from "./authority.js";
import { RoomCommands } from "./commands.js";
import type { RoomCommand } from "./commands.js";
import { RoomEvents } from "./events.js";
import type { RoomEvent } from "./events.js";
import type { RoomLog } from "./evolve.js";
import { AvatarSchema, NameSchema, RoomCodeSchema } from "./identity.js";
import { departure, joinRoom, setProfile, transferHost } from "./members.js";
import { RoomIsClosed } from "./rejection.js";
import type { RoomRejection } from "./rejection.js";
import { RoomSettingsSchema } from "./settings.js";
import { RoomStates } from "./state.js";
import type { Open, RoomState } from "./state.js";
import { MillisSchema, latest } from "./time.js";

export type Decision = Result.Result<readonly RoomEvent[], RoomRejection>;

export const OpeningSchema = Schema.Struct({
  at: MillisSchema,
  avatar: AvatarSchema,
  code: RoomCodeSchema,
  host: PlayerIdSchema,
  name: NameSchema,
  settings: RoomSettingsSchema,
});

export type Opening = typeof OpeningSchema.Type;

export const openRoom = (opening: Opening): RoomLog => [
  RoomEvents.RoomOpened({
    at: opening.at,
    code: opening.code,
    host: opening.host,
    settings: opening.settings,
  }),
  RoomEvents.MemberJoined({
    at: opening.at,
    avatar: opening.avatar,
    name: opening.name,
    player: opening.host,
  }),
];

const byMember = (
  state: Open,
  command: RoomCommand,
  handle: (player: PlayerId) => Decision
): Decision => Result.flatMap(fromMember(state, command), handle);

const byHost = (
  state: Open,
  command: RoomCommand,
  handle: (player: PlayerId) => Decision
): Decision => Result.flatMap(fromHost(state, command), handle);

const decideOpen = (state: Open, command: RoomCommand): Decision =>
  RoomCommands.$match(command, {
    Join: (join) =>
      Result.flatMap(fromSomeone(join), (player) =>
        joinRoom(state, player, join)
      ),
    LeaveRoom: (leave) =>
      byMember(state, leave, (player) =>
        Result.succeed(departure(state, player, leave.at))
      ),
    SetProfile: (profile) =>
      byMember(state, profile, (player) => setProfile(player, profile)),
    TransferHost: (transfer) =>
      byHost(state, transfer, () => transferHost(state, transfer)),
  });

export const decide = (state: RoomState, command: RoomCommand): Decision =>
  RoomStates.$match(state, {
    Closed: (closed) => Result.fail(new RoomIsClosed({ code: closed.code })),
    Open: (open) =>
      decideOpen(open, { ...command, at: latest(command.at, open.now) }),
  });
