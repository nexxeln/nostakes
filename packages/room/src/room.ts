import type { PlayerId } from "@nostakes/engine";
import { PlayerIdSchema } from "@nostakes/engine";
import { Result, Schema } from "effect";

import { fromHost, fromMember, fromSomeone } from "./authority.js";
import { RoomCommands } from "./commands.js";
import type { RoomCommand } from "./commands.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import type { RoomLog } from "./evolve.js";
import { AvatarSchema, NameSchema, RoomCodeSchema } from "./identity.js";
import { joinRoom, leaveRoom, setProfile, transferHost } from "./members.js";
import { answerChips, leaveSeat, requestChips } from "./money.js";
import { RoomIsClosed } from "./rejection.js";
import { answerSeat, requestSeat } from "./seats.js";
import { RoomSettingsSchema } from "./settings.js";
import { RoomStates } from "./state.js";
import type { Open, RoomState } from "./state.js";
import { MillisSchema, latest } from "./time.js";

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
    ApproveChips: (approve) =>
      byHost(state, approve, () => answerChips(state, approve, true)),
    ApproveSeat: (approve) =>
      byHost(state, approve, () => answerSeat(state, approve, true)),
    DenyChips: (deny) =>
      byHost(state, deny, () => answerChips(state, deny, false)),
    DenySeat: (deny) =>
      byHost(state, deny, () => answerSeat(state, deny, false)),
    Join: (join) =>
      Result.flatMap(fromSomeone(join), (player) =>
        joinRoom(state, player, join)
      ),
    LeaveRoom: (leave) =>
      byMember(state, leave, (player) => leaveRoom(state, player, leave.at)),
    LeaveSeat: (leave) =>
      byMember(state, leave, (player) => leaveSeat(state, player, leave.at)),
    RemoveFromSeat: (remove) =>
      byHost(state, remove, () => leaveSeat(state, remove.player, remove.at)),
    RequestChips: (request) =>
      byMember(state, request, (player) =>
        requestChips(state, player, request)
      ),
    RequestSeat: (request) =>
      byMember(state, request, (player) => requestSeat(state, player, request)),
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
