import { PlayerIdSchema } from "@nostakes/engine";
import { Data, Schema } from "effect";

export const RoomCodeSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("RoomCode"));

export type RoomCode = typeof RoomCodeSchema.Type;

export const NameSchema = Schema.NonEmptyString.check(Schema.isMaxLength(40));

export const AvatarSchema = Schema.String.check(Schema.isMaxLength(512));

export const ActorSchema = Schema.TaggedUnion({
  Member: { player: PlayerIdSchema },
  Server: {},
});

export type Actor = typeof ActorSchema.Type;

export const Actors = Data.taggedEnum<Actor>();
