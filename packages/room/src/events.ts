import { PlayerIdSchema } from "@nostakes/engine";
import { Data, Schema } from "effect";

import { AvatarSchema, NameSchema, RoomCodeSchema } from "./identity.js";
import { RoomSettingsSchema } from "./settings.js";
import { MillisSchema } from "./time.js";

const at = MillisSchema;

export const RoomEventSchema = Schema.TaggedUnion({
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
});

export type RoomEvent = typeof RoomEventSchema.Type;

export const RoomEvents = Data.taggedEnum<RoomEvent>();

export type RoomEventOf<Tag extends RoomEvent["_tag"]> = Data.TaggedEnum.Value<
  RoomEvent,
  Tag
>;
