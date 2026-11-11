import { Antes } from "@nostakes/engine";
import {
  Actors,
  DEFAULT_PAUSE_WHEN_AWAY_SECONDS,
  Deadlines,
  JoinRequestSchema,
  MemberCommandSchema,
  OpenRequestSchema,
  RoomCommands,
  RoomEventSchema,
  RoomEvents,
  RoomRejectionSchema,
  RoomSettingsSchema,
  RoomSignalSchema,
  RemovedViewSchema,
  RoomViewSchema,
  SealedDealSources,
  SeenEventSchema,
  TimeBankRefills,
  attendanceCommand,
  audienceOf,
  decide,
  evolve,
  invariants,
  isRemoved,
  millis,
  nextDeadline,
  openRoom,
  redact,
  removedStandings,
  removedView,
  replay,
  signalAllowed,
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
  RoomSettings,
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
  JoinRequestSchema,
  MemberCommandSchema,
  OpenRequestSchema,
} from "@nostakes/room";

export type { JoinRequest, MemberCommand, OpenRequest } from "@nostakes/room";

export const DEAL_SHUFFLE_BYTES = 128;

export const SEAL_BYTES = 2 * DEAL_SHUFFLE_BYTES + DIGEST_BYTES;

export const DEFAULT_SETTINGS: RoomSettings = Schema.decodeSync(
  RoomSettingsSchema
)({
  approval: { chips: false, seats: false },
  betweenHandsSeconds: 5,
  buyIn: { max: 400, min: 40 },
  dealing: "Automatic",
  leavingMidHand: "ActedFor",
  pauseWhenAwaySeconds: DEFAULT_PAUSE_WHEN_AWAY_SECONDS,
  peeking: true,
  runChoiceSeconds: 15,
  seats: 9,
  showdownSeconds: 15,
  shuffle: "Checked",
  sitOutAfterTimeouts: 1,
  table: {
    allInHands: "FaceUp",
    ante: Antes.NoAnte(),
    bigBlind: 2,
    blindPosting: "HomeGame",
    maxRuns: 1,
    rabbitHunt: false,
    rabbitHunters: "DealtIn",
    runCount: "Vote",
    showdown: "Interactive",
    showdownOrder: "RiverAggressor",
    smallBlind: 1,
    straddle: { button: false, underTheGun: 0 },
    straddleSize: "Doubling",
    voluntaryShows: "EitherCard",
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
  readonly Signal: RoomSignal;
  readonly Revoked: RemovedView;
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
  invariants: (state) =>
    invariants(state).map(({ detail, invariant }) => `${invariant}: ${detail}`),
  joinCommand: (request) => MemberCommandSchema.cases.Join.make(request),
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
});

export const pokerRoom = pokerRoomOn(QUICKNET);
