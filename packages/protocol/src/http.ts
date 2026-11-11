import { Schema } from "effect";

import type { WireSchema } from "./frames.js";
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
    "NotAuthorized",
    "RoomOpen",
    "BodyTooLarge",
  ]),
});

export const StandingsRequestSchema = Schema.Struct({ token: TokenSchema });

export type StandingsRequest = typeof StandingsRequestSchema.Type;

export const haltedStandings = <View extends WireSchema>(view: View) =>
  Schema.Struct({ view });

export const revokedStandings = <Revoked extends WireSchema>(
  revoked: Revoked
) => Schema.Struct({ removed: revoked });

export const knockingPass = <Knock extends WireSchema>(knock: Knock) =>
  Schema.Struct({ ...RoomPassSchema.fields, knock });

export const knockStandings = <Knock extends WireSchema>(knock: Knock) =>
  Schema.Struct({ knock });

export const joinRefused = <Rejection extends WireSchema>(
  rejection: Rejection
) => Schema.Struct({ refusal: Schema.Literal("JoinRefused"), rejection });

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
