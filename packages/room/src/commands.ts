import { PlayerIdSchema } from "@nostakes/engine";
import { Data, Schema } from "effect";

import { ActorSchema, AvatarSchema, NameSchema } from "./identity.js";
import { MillisSchema } from "./time.js";

const envelope = { at: MillisSchema, by: ActorSchema };

export const RoomCommandSchema = Schema.TaggedUnion({
  Join: { ...envelope, avatar: AvatarSchema, name: NameSchema },
  LeaveRoom: envelope,
  SetProfile: { ...envelope, avatar: AvatarSchema, name: NameSchema },
  TransferHost: { ...envelope, to: PlayerIdSchema },
});

export type RoomCommand = typeof RoomCommandSchema.Type;

export const RoomCommands = Data.taggedEnum<RoomCommand>();

export type RoomCommandOf<Tag extends RoomCommand["_tag"]> =
  Data.TaggedEnum.Value<RoomCommand, Tag>;
