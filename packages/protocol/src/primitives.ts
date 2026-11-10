import { Schema } from "effect";

export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const ROOM_CODE_LENGTH = 6;

export const RoomCodeSchema = Schema.String.check(
  Schema.isPattern(/^[2-9A-HJKMNP-Z]{6}$/u)
).pipe(Schema.brand("RoomCode"));

export type RoomCode = typeof RoomCodeSchema.Type;

export const PLAYER_ID_BYTES = 12;

export const PlayerIdSchema = Schema.String.check(
  Schema.isPattern(/^[\w-]{16}$/u)
).pipe(Schema.brand("PlayerId"));

export type PlayerId = typeof PlayerIdSchema.Type;

export const TOKEN_BYTES = 32;

export const TokenTextSchema = Schema.String.check(
  Schema.isPattern(/^[\w-]{43}$/u)
).pipe(Schema.brand("Token"));

export type TokenText = typeof TokenTextSchema.Type;

export const TokenSchema = Schema.RedactedFromValue(TokenTextSchema, {
  label: "token",
});

export type Token = typeof TokenSchema.Type;

export const CommandIdSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(64)
).pipe(Schema.brand("CommandId"));

export type CommandId = typeof CommandIdSchema.Type;

export const SeqSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("Seq"));

export type Seq = typeof SeqSchema.Type;
