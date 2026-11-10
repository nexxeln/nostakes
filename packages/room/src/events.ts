import { EventSchema, PlayerIdSchema, SeatIndexSchema } from "@nostakes/engine";
import { Data, Schema } from "effect";

import { AvatarSchema, NameSchema, RoomCodeSchema } from "./identity.js";
import { ChipAmountSchema, RoomSettingsSchema } from "./settings.js";
import { MillisSchema } from "./time.js";

const at = MillisSchema;

export const RoomEventSchema = Schema.TaggedUnion({
  BoughtIn: {
    amount: ChipAmountSchema,
    at,
    player: PlayerIdSchema,
    seat: SeatIndexSchema,
  },
  CashedOut: {
    amount: ChipAmountSchema,
    at,
    player: PlayerIdSchema,
    seat: SeatIndexSchema,
  },
  ChipsApproved: { at, player: PlayerIdSchema },
  ChipsDenied: { at, player: PlayerIdSchema },
  ChipsRequested: { amount: ChipAmountSchema, at, player: PlayerIdSchema },
  GamePaused: { at },
  GameStarted: { at },
  HostChanged: { at, host: PlayerIdSchema },
  MemberJoined: {
    at,
    avatar: AvatarSchema,
    name: NameSchema,
    player: PlayerIdSchema,
  },
  MemberLeft: { at, player: PlayerIdSchema },
  ProfileChanged: {
    at,
    avatar: AvatarSchema,
    name: NameSchema,
    player: PlayerIdSchema,
  },
  RoomOpened: {
    at,
    code: RoomCodeSchema,
    host: PlayerIdSchema,
    settings: RoomSettingsSchema,
  },
  SeatApproved: { at, player: PlayerIdSchema },
  SeatDenied: { at, player: PlayerIdSchema },
  SeatRequested: {
    at,
    buyIn: ChipAmountSchema,
    player: PlayerIdSchema,
    seat: SeatIndexSchema,
  },
  StraddleDeclared: { at, on: Schema.Boolean, player: PlayerIdSchema },
  Table: { at, event: EventSchema },
});

export type RoomEvent = typeof RoomEventSchema.Type;

export const RoomEvents = Data.taggedEnum<RoomEvent>();

export type RoomEventOf<Tag extends RoomEvent["_tag"]> = Data.TaggedEnum.Value<
  RoomEvent,
  Tag
>;
