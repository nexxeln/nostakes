import { ExpressionSchema } from "@nostakes/avatar";
import { MomentKindSchema } from "@nostakes/room";
import { Schema } from "effect";

export const PictureSeatSchema = Schema.Struct({
  avatar: Schema.String,
  backs: Schema.Int,
  cards: Schema.Array(Schema.String),
  expression: ExpressionSchema,
  hand: Schema.String,
  name: Schema.String,
  note: Schema.String,
  playing: Schema.Array(Schema.String),
  swing: Schema.NullOr(Schema.Int),
  won: Schema.Boolean,
});

export type PictureSeat = typeof PictureSeatSchema.Type;

export const PictureFlagSchema = Schema.Struct({
  board: Schema.Int,
  card: Schema.String,
  word: Schema.String,
});

export type PictureFlag = typeof PictureFlagSchema.Type;

export const MomentPictureSchema = Schema.Struct({
  blinds: Schema.Int,
  boards: Schema.Array(Schema.Array(Schema.String)),
  flag: Schema.NullOr(PictureFlagSchema),
  foot: Schema.String,
  hand: Schema.Int,
  kicker: Schema.String,
  kind: MomentKindSchema,
  lifted: Schema.Array(Schema.String),
  line: Schema.String,
  meta: Schema.String,
  painful: Schema.Boolean,
  pot: Schema.Int,
  seats: Schema.Array(PictureSeatSchema),
  tier: Schema.Literals([1, 2, 3]),
  title: Schema.String,
  verb: Schema.String,
});

export type MomentPicture = typeof MomentPictureSchema.Type;
