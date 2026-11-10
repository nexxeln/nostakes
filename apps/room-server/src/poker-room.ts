import { Antes } from "@nostakes/engine";
import {
  Actors,
  AvatarSchema,
  Deadlines,
  NameSchema,
  RoomCommandSchema,
  RoomCommands,
  RoomEventSchema,
  RoomEvents,
  RoomRejectionSchema,
  RoomSettingsSchema,
  RoomViewSchema,
  SeenEventSchema,
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

export const DEAL_SHUFFLE_BYTES = 128;

export const DEFAULT_SETTINGS: RoomSettings = Schema.decodeSync(
  RoomSettingsSchema
)({
  approval: { chips: false, seats: false },
  betweenHandsSeconds: 5,
  buyIn: { max: 400, min: 40 },
  runChoiceSeconds: 15,
  table: {
    ante: Antes.NoAnte(),
    bigBlind: 2,
    maxRuns: 1,
    rabbitHunt: false,
    smallBlind: 1,
    straddle: { button: false, underTheGun: 0 },
  },
  timeBankSeconds: 60,
  turnSeconds: 30,
});

const { cases } = RoomCommandSchema;

export const MemberCommandSchema = Schema.TaggedUnion({
  Act: { action: cases.Act.fields.action },
  ActForSeat: { player: cases.ActForSeat.fields.player },
  ApproveChips: { player: cases.ApproveChips.fields.player },
  ApproveSeat: { player: cases.ApproveSeat.fields.player },
  ChangeSettings: { settings: cases.ChangeSettings.fields.settings },
  ChooseRuns: { runs: cases.ChooseRuns.fields.runs },
  CloseRoom: {},
  DeclareStraddle: { on: cases.DeclareStraddle.fields.on },
  DenyChips: { player: cases.DenyChips.fields.player },
  DenySeat: { player: cases.DenySeat.fields.player },
  Join: { avatar: cases.Join.fields.avatar, name: cases.Join.fields.name },
  LeaveRoom: {},
  LeaveSeat: {},
  PauseGame: {},
  RabbitHunt: {},
  RemoveFromSeat: { player: cases.RemoveFromSeat.fields.player },
  RequestChips: { amount: cases.RequestChips.fields.amount },
  RequestSeat: {
    buyIn: cases.RequestSeat.fields.buyIn,
    seat: cases.RequestSeat.fields.seat,
  },
  SetProfile: {
    avatar: cases.SetProfile.fields.avatar,
    name: cases.SetProfile.fields.name,
  },
  ShowCards: { cards: cases.ShowCards.fields.cards },
  SitIn: {},
  SitOut: {},
  StartGame: {},
  TransferHost: { to: cases.TransferHost.fields.to },
});

export type MemberCommand = typeof MemberCommandSchema.Type;

export const OpenRequestSchema = Schema.Struct({
  avatar: AvatarSchema,
  name: NameSchema,
  settings: Schema.optionalKey(RoomSettingsSchema),
});

export type OpenRequest = typeof OpenRequestSchema.Type;

export const JoinRequestSchema = Schema.Struct({
  avatar: AvatarSchema,
  name: NameSchema,
});

export type JoinRequest = typeof JoinRequestSchema.Type;

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
