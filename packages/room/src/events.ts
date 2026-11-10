import {
  EventSchema,
  PlayerIdSchema,
  SeatIndexSchema,
  TableConfigSchema,
} from "@nostakes/engine";
import {
  BeaconRoundSchema,
  DeckOpeningSchema,
  DeckSchema as SealedDeckSchema,
  DigestSchema,
  DrandChainSchema,
  OpeningSchema as CardOpeningSchema,
  QUICKNET,
  RoleSchema,
  SaltSecretSchema,
} from "@nostakes/shuffle";
import { Data, Effect, Schema } from "effect";

import { DeadlineSchema } from "./deadline.js";
import { AvatarSchema, NameSchema, RoomCodeSchema } from "./identity.js";
import { ChipAmountSchema, RoomSettingsSchema } from "./settings.js";
import { SettlementSchema } from "./settlement.js";
import { MillisSchema } from "./time.js";

const at = MillisSchema;

export const HandNumberSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1)
);

export const sealFields = {
  at,
  hand: HandNumberSchema,
  roots: Schema.Tuple([DigestSchema, DigestSchema]),
  round: BeaconRoundSchema,
  seats: Schema.Array(SeatIndexSchema),
};

export const HolderSchema = Schema.Struct({
  player: PlayerIdSchema,
  seat: SeatIndexSchema,
});

export type Holder = typeof HolderSchema.Type;

export const OpenedCardSchema = Schema.Struct({
  opening: CardOpeningSchema,
  role: RoleSchema,
});

export type OpenedCard = typeof OpenedCardSchema.Type;

export const WithdrawalReasonSchema = Schema.Literals([
  "GamePaused",
  "RoomClosing",
  "SeatsChanged",
]);

export type WithdrawalReason = typeof WithdrawalReasonSchema.Type;

const chainWhenAbsent = Effect.succeed(QUICKNET);

export const roomEventFields = {
  BoughtIn: {
    amount: ChipAmountSchema,
    at,
    player: PlayerIdSchema,
    seat: SeatIndexSchema,
  },
  CardsOpened: {
    at,
    hand: HandNumberSchema,
    holder: Schema.Option(HolderSchema),
    openings: Schema.Array(OpenedCardSchema),
  },
  CashedOut: {
    amount: ChipAmountSchema,
    at,
    player: PlayerIdSchema,
    seat: SeatIndexSchema,
  },
  ChipsApproved: { at, player: PlayerIdSchema },
  ChipsDenied: { at, player: PlayerIdSchema },
  ChipsQueued: { amount: ChipAmountSchema, at, player: PlayerIdSchema },
  ChipsRequested: { amount: ChipAmountSchema, at, player: PlayerIdSchema },
  ClockStopped: { at },
  CloseQueued: { at },
  DealtFromBeacon: {
    at,
    hand: HandNumberSchema,
    round: BeaconRoundSchema,
    signature: Schema.Uint8Array,
    spare: DeckOpeningSchema,
  },
  DealtWithoutBeacon: {
    at,
    hand: HandNumberSchema,
    reason: Schema.Literal("BeaconUnavailable"),
    round: BeaconRoundSchema,
  },
  GamePaused: { at },
  GameStarted: { at },
  HostChanged: { at, host: PlayerIdSchema },
  LeaveQueued: { at, player: PlayerIdSchema },
  MarkedAway: { at, seat: SeatIndexSchema },
  MemberJoined: {
    at,
    avatar: AvatarSchema,
    name: NameSchema,
    player: PlayerIdSchema,
  },
  MemberLeft: { at, player: PlayerIdSchema },
  NextHandCalled: { at },
  PostingChosen: { at, player: PlayerIdSchema, post: Schema.Boolean },
  ProfileChanged: {
    at,
    avatar: AvatarSchema,
    name: NameSchema,
    player: PlayerIdSchema,
  },
  RoomClosed: { at, settlement: SettlementSchema },
  RoomOpened: {
    at,
    chain: DrandChainSchema.pipe(
      Schema.withConstructorDefault(chainWhenAbsent),
      Schema.withDecodingDefaultTypeKey(chainWhenAbsent)
    ),
    code: RoomCodeSchema,
    host: PlayerIdSchema,
    settings: RoomSettingsSchema,
  },
  RulesQueued: { at, config: TableConfigSchema },
  RunClockStarted: { at, deadline: MillisSchema },
  SealWithdrawn: {
    at,
    hand: HandNumberSchema,
    reason: WithdrawalReasonSchema,
    round: BeaconRoundSchema,
  },
  SeatApproved: { at, player: PlayerIdSchema },
  SeatDenied: { at, player: PlayerIdSchema },
  SeatRequested: {
    at,
    buyIn: ChipAmountSchema,
    player: PlayerIdSchema,
    seat: SeatIndexSchema,
  },
  SettingsChanged: { at, settings: RoomSettingsSchema },
  ShowdownClockStarted: { at, deadline: MillisSchema, seat: SeatIndexSchema },
  StallCleared: { at },
  StraddleDeclared: { at, on: Schema.Boolean, player: PlayerIdSchema },
  TableAttended: {
    at,
    player: PlayerIdSchema,
    quietSince: Schema.Option(MillisSchema),
  },
  TableStalled: { at, deadline: DeadlineSchema },
  TableUnattended: { at },
  TableWentQuiet: { at },
  TimeBankRefilled: {
    at,
    player: PlayerIdSchema,
    seconds: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  },
  TimeBankSpent: {
    at,
    player: PlayerIdSchema,
    seconds: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  },
  TimeBankStarted: { at, deadline: MillisSchema, player: PlayerIdSchema },
  TimedOut: { at, player: PlayerIdSchema, seat: SeatIndexSchema },
  TimeoutStreakEnded: { at, player: PlayerIdSchema },
  TurnClockStarted: {
    at,
    deadline: MillisSchema,
    player: PlayerIdSchema,
    seat: SeatIndexSchema,
  },
};

export const RoomEventSchema = Schema.TaggedUnion({
  ...roomEventFields,
  HandSealed: {
    ...sealFields,
    decks: Schema.Tuple([SealedDeckSchema, SealedDeckSchema]),
    secret: SaltSecretSchema,
  },
  Table: { at, event: EventSchema },
});

export type RoomEvent = typeof RoomEventSchema.Type;

export const RoomEvents = Data.taggedEnum<RoomEvent>();

export type RoomEventOf<Tag extends RoomEvent["_tag"]> = Data.TaggedEnum.Value<
  RoomEvent,
  Tag
>;
