import { PlayerIdSchema, SeatIndexSchema } from "@nostakes/engine";
import { Data, Schema } from "effect";

import { ActorSchema, AvatarSchema, NameSchema } from "./identity.js";
import { ChipAmountSchema } from "./settings.js";
import { MillisSchema } from "./time.js";

const envelope = { at: MillisSchema, by: ActorSchema };

const naming = { ...envelope, player: PlayerIdSchema };

export const RoomCommandSchema = Schema.TaggedUnion({
  ApproveChips: naming,
  ApproveSeat: naming,
  Deal: { ...envelope, shuffleBytes: Schema.Uint8Array },
  DeclareStraddle: { ...envelope, on: Schema.Boolean },
  DenyChips: naming,
  DenySeat: naming,
  Join: { ...envelope, avatar: AvatarSchema, name: NameSchema },
  LeaveRoom: envelope,
  LeaveSeat: envelope,
  PauseGame: envelope,
  RemoveFromSeat: naming,
  RequestChips: { ...envelope, amount: ChipAmountSchema },
  RequestSeat: { ...envelope, buyIn: ChipAmountSchema, seat: SeatIndexSchema },
  SetProfile: { ...envelope, avatar: AvatarSchema, name: NameSchema },
  SitIn: envelope,
  SitOut: envelope,
  StartGame: envelope,
  TransferHost: { ...envelope, to: PlayerIdSchema },
});

export type RoomCommand = typeof RoomCommandSchema.Type;

export const RoomCommands = Data.taggedEnum<RoomCommand>();

export type RoomCommandOf<Tag extends RoomCommand["_tag"]> =
  Data.TaggedEnum.Value<RoomCommand, Tag>;
