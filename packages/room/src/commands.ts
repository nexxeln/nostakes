import {
  ActionSchema,
  PlayerIdSchema,
  RunCountSchema,
  SeatIndexSchema,
  ShownCardsSchema,
} from "@nostakes/engine";
import { BeaconRoundSchema } from "@nostakes/shuffle";
import { Data, Schema } from "effect";

import { ActorSchema, AvatarSchema, NameSchema } from "./identity.js";
import { ChipAmountSchema, RequestedSettingsSchema } from "./settings.js";
import { MillisSchema } from "./time.js";

const envelope = { at: MillisSchema, by: ActorSchema };

const naming = { ...envelope, player: PlayerIdSchema };

export const SealedDealSourceSchema = Schema.TaggedUnion({
  BeaconUnavailable: { shuffleBytes: Schema.Uint8Array },
  FromBeacon: { round: BeaconRoundSchema, signature: Schema.Uint8Array },
});

export type SealedDealSource = typeof SealedDealSourceSchema.Type;

export const SealedDealSources = Data.taggedEnum<SealedDealSource>();

export const RoomCommandSchema = Schema.TaggedUnion({
  Act: { ...envelope, action: ActionSchema },
  ActForSeat: naming,
  ApproveChips: naming,
  ApproveSeat: naming,
  ChangeSettings: { ...envelope, settings: RequestedSettingsSchema },
  ChoosePosting: { ...envelope, post: Schema.Boolean },
  ChooseRuns: { ...envelope, runs: RunCountSchema },
  CloseRoom: envelope,
  Deal: { ...envelope, shuffleBytes: Schema.Uint8Array },
  DealNextHand: envelope,
  DealSealed: { ...envelope, source: SealedDealSourceSchema },
  DeclareStraddle: { ...envelope, on: Schema.Boolean },
  DenyChips: naming,
  DenySeat: naming,
  ExpireClock: { ...envelope, deadline: MillisSchema },
  Join: { ...envelope, avatar: AvatarSchema, name: NameSchema },
  LeaveRoom: envelope,
  LeaveSeat: envelope,
  MuckHand: envelope,
  NoteAttendance: { ...envelope, connected: Schema.Array(PlayerIdSchema) },
  PauseGame: envelope,
  QuietTable: envelope,
  RabbitHunt: envelope,
  RemoveFromSeat: naming,
  RequestChips: { ...envelope, amount: ChipAmountSchema },
  RequestSeat: { ...envelope, buyIn: ChipAmountSchema, seat: SeatIndexSchema },
  RunQueue: envelope,
  SealHand: {
    ...envelope,
    decks: Schema.Tuple([Schema.Uint8Array, Schema.Uint8Array]),
    round: BeaconRoundSchema,
    secret: Schema.Uint8Array,
  },
  SetProfile: { ...envelope, avatar: AvatarSchema, name: NameSchema },
  ShowCards: { ...envelope, cards: ShownCardsSchema },
  SitIn: envelope,
  SitOut: envelope,
  StartGame: envelope,
  TableHand: envelope,
  TransferHost: { ...envelope, to: PlayerIdSchema },
});

export type RoomCommand = typeof RoomCommandSchema.Type;

export const RoomCommands = Data.taggedEnum<RoomCommand>();

export type RoomCommandOf<Tag extends RoomCommand["_tag"]> =
  Data.TaggedEnum.Value<RoomCommand, Tag>;
