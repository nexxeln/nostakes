import { Antes } from "@nostakes/engine";
import {
  Actors,
  Deadlines,
  JoinRequestSchema,
  MemberCommandSchema,
  OpenRequestSchema,
  RoomCommands,
  RoomEventSchema,
  RoomEvents,
  RoomRejectionSchema,
  RoomSettingsSchema,
  RoomViewSchema,
  SeenEventSchema,
  TimeBankRefills,
  audienceOf,
  decide,
  evolve,
  invariants,
  millis,
  nextDeadline,
  openRoom,
  redact,
  replay,
  viewFor,
} from "@nostakes/room";
import type {
  Audience,
  Deadline,
  JoinRequest,
  MemberCommand,
  OpenRequest,
  RoomCommand,
  RoomEvent,
  RoomRejection,
  RoomSettings,
  RoomState,
  RoomView,
  SeenEvent,
} from "@nostakes/room";
import { Option, Schema } from "effect";

import type { HostedRoom } from "./hosted-room.js";

export {
  JoinRequestSchema,
  MemberCommandSchema,
  OpenRequestSchema,
} from "@nostakes/room";

export type { JoinRequest, MemberCommand, OpenRequest } from "@nostakes/room";

export const DEAL_SHUFFLE_BYTES = 128;

export const DEFAULT_SETTINGS: RoomSettings = Schema.decodeSync(
  RoomSettingsSchema
)({
  approval: { chips: false, seats: false },
  betweenHandsSeconds: 5,
  buyIn: { max: 400, min: 40 },
  dealing: "Automatic",
  runChoiceSeconds: 15,
  seats: 9,
  showdownSeconds: 15,
  shuffle: "Plain",
  sitOutAfterTimeouts: 1,
  table: {
    ante: Antes.NoAnte(),
    bigBlind: 2,
    maxRuns: 1,
    rabbitHunt: false,
    showdown: "Interactive",
    smallBlind: 1,
    straddle: { button: false, underTheGun: 0 },
  },
  timeBankRefill: TimeBankRefills.NoRefill(),
  timeBankSeconds: 60,
  topUps: "UpToMax",
  turnSeconds: 30,
});

export interface PokerTypes {
  readonly State: RoomState;
  readonly Command: RoomCommand;
  readonly MemberCommand: MemberCommand;
  readonly Event: RoomEvent;
  readonly Redacted: SeenEvent;
  readonly View: RoomView;
  readonly Rejection: RoomRejection;
  readonly Audience: Audience;
  readonly Due: Deadline;
  readonly OpenRequest: OpenRequest;
  readonly JoinRequest: JoinRequest;
}

export class LogNotOpened extends Schema.TaggedError<
  LogNotOpened,
  { readonly brand: unique symbol }
>()("LogNotOpened", { first: Schema.String }) {
  override get message() {
    return `A stored room log must start with RoomOpened, and this one starts with ${this.first}. The log is corrupt: restore the room's storage from a backup rather than editing events.`;
  }
}

const replayLog = (events: Iterable<RoomEvent>): RoomState => {
  const [first, ...rest] = [...events];

  if (first === undefined || !RoomEvents.$is("RoomOpened")(first)) {
    throw new LogNotOpened({ first: first?._tag ?? "nothing" });
  }

  return replay([first, ...rest]);
};

export const pokerRoom: HostedRoom<PokerTypes> = {
  audienceOf,
  decide,
  entropyFor: (due) => (Deadlines.$is("DealDue")(due) ? DEAL_SHUFFLE_BYTES : 0),
  evolve,
  invariants: (state) =>
    invariants(state).map(({ detail, invariant }) => `${invariant}: ${detail}`),
  joinCommand: (request) => MemberCommandSchema.cases.Join.make(request),
  nextDeadline: (state) =>
    nextDeadline(state).pipe(Option.map((due) => ({ at: due.at, due }))),
  open: ({ at, code, host, request }) =>
    openRoom({
      at: millis(at),
      avatar: request.avatar,
      code,
      host,
      name: request.name,
      settings: request.settings ?? DEFAULT_SETTINGS,
    }),
  redact: (event, audience) => Option.some(redact(event, audience)),
  replay: replayLog,
  schemas: {
    event: Schema.toCodecJson(RoomEventSchema),
    joinRequest: Schema.toCodecJson(JoinRequestSchema),
    memberCommand: Schema.toCodecJson(MemberCommandSchema),
    openRequest: Schema.toCodecJson(OpenRequestSchema),
    redacted: Schema.toCodecJson(SeenEventSchema),
    rejection: Schema.toCodecJson(RoomRejectionSchema),
    view: Schema.toCodecJson(RoomViewSchema),
  },
  serverCommand: (due, at, entropy) =>
    Deadlines.$match(due, {
      DealDue: () =>
        RoomCommands.Deal({
          at: millis(at),
          by: Actors.Server(),
          shuffleBytes: entropy,
        }),
      RunChoiceClock: (clock) =>
        RoomCommands.ExpireClock({
          at: millis(at),
          by: Actors.Server(),
          deadline: clock.at,
        }),
      ShowdownClock: (clock) =>
        RoomCommands.ExpireClock({
          at: millis(at),
          by: Actors.Server(),
          deadline: clock.at,
        }),
      TurnClock: (clock) =>
        RoomCommands.ExpireClock({
          at: millis(at),
          by: Actors.Server(),
          deadline: clock.at,
        }),
    }),
  stamp: (player, at, command) => ({
    ...command,
    at: millis(at),
    by: Actors.Member({ player }),
  }),
  viewFor: (state, audience, at) => viewFor(state, audience, millis(at)),
};
