import type { PlayerId } from "@nostakes/engine";
import { PlayerIdSchema } from "@nostakes/engine";
import { Result, Schema } from "effect";

import { fromHost, fromMember, fromServer, fromSomeone } from "./authority.js";
import { actForSeat, clockEvents, expireClock } from "./clocks.js";
import { RoomCommands } from "./commands.js";
import type { RoomCommand } from "./commands.js";
import { deal, pauseGame, startGame } from "./dealing.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import type { RoomEvent } from "./events.js";
import { evolveAll } from "./evolve.js";
import type { RoomLog } from "./evolve.js";
import { AvatarSchema, NameSchema, RoomCodeSchema } from "./identity.js";
import { joinRoom, leaveRoom, setProfile, transferHost } from "./members.js";
import { answerChips, leaveSeat, requestChips } from "./money.js";
import { play } from "./play.js";
import { RoomIsClosed } from "./rejection.js";
import { answerSeat, declareStraddle, requestSeat, sitOut } from "./seats.js";
import { RoomSettingsSchema } from "./settings.js";
import { RoomStates, isOpen } from "./state.js";
import type { Open, RoomState } from "./state.js";
import { MillisSchema, latest } from "./time.js";
import type { Millis } from "./time.js";

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
    Act: (act) => byMember(state, act, (player) => play(state, player, act)),
    ActForSeat: (actFor) =>
      byHost(state, actFor, () => actForSeat(state, actFor)),
    ApproveChips: (approve) =>
      byHost(state, approve, () => answerChips(state, approve, true)),
    ApproveSeat: (approve) =>
      byHost(state, approve, () => answerSeat(state, approve, true)),
    ChooseRuns: (choose) =>
      byMember(state, choose, (player) => play(state, player, choose)),
    Deal: (dealing) =>
      Result.flatMap(fromServer(dealing), () => deal(state, dealing)),
    DeclareStraddle: (declare) =>
      byMember(state, declare, (player) =>
        declareStraddle(state, player, declare)
      ),
    DenyChips: (deny) =>
      byHost(state, deny, () => answerChips(state, deny, false)),
    DenySeat: (deny) =>
      byHost(state, deny, () => answerSeat(state, deny, false)),
    ExpireClock: (expiry) =>
      Result.flatMap(fromServer(expiry), () => expireClock(state, expiry)),
    Join: (join) =>
      Result.flatMap(fromSomeone(join), (player) =>
        joinRoom(state, player, join)
      ),
    LeaveRoom: (leave) =>
      byMember(state, leave, (player) => leaveRoom(state, player, leave.at)),
    LeaveSeat: (leave) =>
      byMember(state, leave, (player) => leaveSeat(state, player, leave.at)),
    PauseGame: (pause) =>
      byHost(state, pause, () => pauseGame(state, pause.at)),
    RabbitHunt: (hunt) =>
      byMember(state, hunt, (player) => play(state, player, hunt)),
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
    ShowCards: (show) =>
      byMember(state, show, (player) => play(state, player, show)),
    SitIn: (sitIn) =>
      byMember(state, sitIn, (player) =>
        sitOut(state, player, false, sitIn.at)
      ),
    SitOut: (out) =>
      byMember(state, out, (player) => sitOut(state, player, true, out.at)),
    StartGame: (start) =>
      byHost(state, start, () => startGame(state, start.at)),
    TransferHost: (transfer) =>
      byHost(state, transfer, () => transferHost(state, transfer)),
  });

const followThrough = (
  before: Open,
  events: readonly RoomEvent[],
  at: Millis
): readonly RoomEvent[] => {
  const after = evolveAll(before, events);

  return isOpen(after)
    ? [...events, ...clockEvents(before, after, events, at)]
    : events;
};

export const decide = (state: RoomState, command: RoomCommand): Decision =>
  RoomStates.$match(state, {
    Closed: (closed) => Result.fail(new RoomIsClosed({ code: closed.code })),
    Open: (open) => {
      const at = latest(command.at, open.now);

      return Result.map(decideOpen(open, { ...command, at }), (events) =>
        followThrough(open, events, at)
      );
    },
  });
