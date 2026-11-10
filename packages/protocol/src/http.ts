import { Schema } from "effect";

import { PlayerIdSchema, RoomCodeSchema, TokenSchema } from "./primitives.js";

export const RoomPassSchema = Schema.Struct({
  code: RoomCodeSchema,
  player: PlayerIdSchema,
  token: TokenSchema,
});

export type RoomPass = typeof RoomPassSchema.Type;

export const HttpRefusalSchema = Schema.Struct({
  refusal: Schema.Literals([
    "BadOrigin",
    "BadRequest",
    "NotFound",
    "RoomFull",
    "RoomHalted",
    "NoFreeCode",
    "UpgradeRequired",
  ]),
});

export type HttpRefusal = typeof HttpRefusalSchema.Type;
