import { Schema } from "effect";

import { PlayerIdSchema, RoomCodeSchema, TokenSchema } from "./primitives.js";

export const RoomPassSchema = Schema.Struct({
  code: RoomCodeSchema,
  player: PlayerIdSchema,
  token: TokenSchema,
});

export type RoomPass = typeof RoomPassSchema.Type;

export const PlainRefusalSchema = Schema.Struct({
  refusal: Schema.Literals([
    "BadOrigin",
    "BadRequest",
    "NotFound",
    "RoomFull",
    "RoomHalted",
    "NoFreeCode",
    "UpgradeRequired",
    "RoomUnavailable",
    "ServerFault",
  ]),
});

export type PlainRefusal = typeof PlainRefusalSchema.Type;

export const TooManyRequestsSchema = Schema.Struct({
  refusal: Schema.Literal("TooManyRequests"),
  retryAfterSeconds: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export type TooManyRequests = typeof TooManyRequestsSchema.Type;

export const HttpRefusalSchema = Schema.Union([
  PlainRefusalSchema,
  TooManyRequestsSchema,
]);

export type HttpRefusal = typeof HttpRefusalSchema.Type;
