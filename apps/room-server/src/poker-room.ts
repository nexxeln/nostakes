import {
  Actors,
  DEFAULT_SETTINGS,
  Deadlines,
  JoinRequestSchema,
  MemberCommandSchema,
  OpenRequestSchema,
  RoomCommands,
  RoomEventSchema,
  RoomEvents,
  RoomRejectionSchema,
  RoomSignalSchema,
  KnockViewSchema,
  RemovedViewSchema,
  RoomViewSchema,
  SealedDealSources,
  SeenEventSchema,
  attendanceCommand,
  audienceOf,
  decide,
  evolve,
  invariants,
  holdsPlace,
  isRemoved,
  knockView,
  millis,
  nextDeadline,
  openRoom,
  redact,
  removedStandings,
  removedView,
  replay,
  signalAllowed,
  voiceAccess,
  voiceModerator,
  stallCommand,
  standingsView,
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
  KnockView,
  RemovedView,
  RoomSignal,
  RoomState,
  RoomView,
  SeenEvent,
} from "@nostakes/room";
import type { DrandChain } from "@nostakes/shuffle";
import {
  DIGEST_BYTES,
  EpochMillisSchema,
  QUICKNET,
  roundToSeal,
} from "@nostakes/shuffle";
import { Option, Schema } from "effect";

import type { HostedRoom } from "./hosted-room.js";

export {
  DEFAULT_SETTINGS,
  JoinRequestSchema,
  MemberCommandSchema,
  OpenRequestSchema,
} from "@nostakes/room";

export type { JoinRequest, MemberCommand, OpenRequest } from "@nostakes/room";

export const DEAL_SHUFFLE_BYTES = 128;

export const SEAL_BYTES = 2 * DEAL_SHUFFLE_BYTES + DIGEST_BYTES;

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
  readonly Signal: RoomSignal;
  readonly Revoked: RemovedView;
  readonly Knock: KnockView;
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

export const pokerRoomOn = (chain: DrandChain): HostedRoom<PokerTypes> => ({
  attendance: (state, connected, at) =>
    attendanceCommand(state, connected, millis(at)),
  audienceOf,
  beaconRoundFor: (due) =>
    Deadlines.$is("SealedDealDue")(due)
      ? Option.some(due.round)
      : Option.none(),
  commandKind: (command) => command._tag,
  decide,
  dueKind: (due) => due._tag,
  entropyFor: (due) =>
    Deadlines.$match(due, {
      DealDue: () => DEAL_SHUFFLE_BYTES,
      KnockLapses: () => 0,
      QueueDue: () => 0,
      QuietDue: () => 0,
      RunChoiceClock: () => 0,
      SealDue: () => SEAL_BYTES,
      SealedDealDue: () => DEAL_SHUFFLE_BYTES,
      ShowdownClock: () => 0,
      TurnClock: () => 0,
    }),
  eventKind: (event) => event._tag,
  evolve,
  haltedView: (state, audience, at) =>
    standingsView(state, audience, millis(at)),
  holdsPlace,
  invariants: (state) =>
    invariants(state).map(({ detail, invariant }) => `${invariant}: ${detail}`),
  joinCommand: (request) => MemberCommandSchema.cases.Join.make(request),
  knockOf: knockView,
  nextDeadline: (state) =>
    nextDeadline(state).pipe(Option.map((due) => ({ at: due.at, due }))),
  open: ({ at, code, host, request }) =>
    openRoom({
      at: millis(at),
      avatar: request.avatar,
      chain,
      code,
      host,
      name: request.name,
      settings: request.settings ?? DEFAULT_SETTINGS,
    }),
  redact: (event, audience) => Option.some(redact(event, audience)),
  rejectionKind: (rejection) => rejection._tag,
  replay: replayLog,
  revoked: isRemoved,
  revokedView: (state, player, at, halted) =>
    halted
      ? removedStandings(state, player, millis(at))
      : removedView(state, player),
  schemas: {
    event: Schema.toCodecJson(RoomEventSchema),
    joinRequest: Schema.toCodecJson(JoinRequestSchema),
    knock: Schema.toCodecJson(KnockViewSchema),
    memberCommand: Schema.toCodecJson(MemberCommandSchema),
    openRequest: Schema.toCodecJson(OpenRequestSchema),
    redacted: Schema.toCodecJson(SeenEventSchema),
    rejection: Schema.toCodecJson(RoomRejectionSchema),
    revoked: Schema.toCodecJson(RemovedViewSchema),
    signal: Schema.toCodecJson(RoomSignalSchema),
    view: Schema.toCodecJson(RoomViewSchema),
  },
  serverCommand: (due, at, entropy, signature) =>
    Deadlines.$match(due, {
      DealDue: () =>
        RoomCommands.Deal({
          at: millis(at),
          by: Actors.Server(),
          shuffleBytes: entropy,
        }),
      KnockLapses: () =>
        RoomCommands.LapseKnocks({ at: millis(at), by: Actors.Server() }),
      QueueDue: () =>
        RoomCommands.RunQueue({ at: millis(at), by: Actors.Server() }),
      QuietDue: () =>
        RoomCommands.QuietTable({ at: millis(at), by: Actors.Server() }),
      RunChoiceClock: (clock) =>
        RoomCommands.ExpireClock({
          at: millis(at),
          by: Actors.Server(),
          deadline: clock.at,
        }),
      SealDue: () =>
        RoomCommands.SealHand({
          at: millis(at),
          by: Actors.Server(),
          decks: [
            entropy.slice(0, DEAL_SHUFFLE_BYTES),
            entropy.slice(DEAL_SHUFFLE_BYTES, 2 * DEAL_SHUFFLE_BYTES),
          ],
          round: roundToSeal(chain, EpochMillisSchema.make(at)),
          secret: entropy.slice(2 * DEAL_SHUFFLE_BYTES, SEAL_BYTES),
        }),
      SealedDealDue: ({ round }) =>
        RoomCommands.DealSealed({
          at: millis(at),
          by: Actors.Server(),
          source: Option.match(signature, {
            onNone: () =>
              SealedDealSources.BeaconUnavailable({ shuffleBytes: entropy }),
            onSome: (signed) =>
              SealedDealSources.FromBeacon({ round, signature: signed }),
          }),
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
  signalAllowed,
  stalled: (state, due, at) => stallCommand(state, due, millis(at)),
  stamp: (player, at, command) => ({
    ...command,
    at: millis(at),
    by: Actors.Member({ player }),
  }),
  viewFor: (state, audience, at) => viewFor(state, audience, millis(at)),
  voiceAccess,
  voiceModerator,
});

export const pokerRoom = pokerRoomOn(QUICKNET);
