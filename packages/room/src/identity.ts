import { PlayerIdSchema } from "@nostakes/engine";
import { Data, Schema } from "effect";

import { isPlainName, isPlainText } from "./names.js";

export { RoomCodeSchema, type RoomCode } from "@nostakes/protocol";

export const NameSchema = Schema.String.check(isPlainName);

export const AvatarSchema = Schema.String.check(
  Schema.isMaxLength(512),
  isPlainText
);

export const ActorSchema = Schema.TaggedUnion({
  Member: { player: PlayerIdSchema },
  Server: {},
});

export type Actor = typeof ActorSchema.Type;

export const Actors = Data.taggedEnum<Actor>();
