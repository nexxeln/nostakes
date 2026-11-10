import { ExpressionSchema } from "@nostakes/avatar";
import { MomentKindSchema } from "@nostakes/room";
import { Schema } from "effect";

export const PictureFaceSchema = Schema.Struct({
  avatar: Schema.String,
  cards: Schema.Array(Schema.String),
  expression: ExpressionSchema,
  name: Schema.String,
});

export type PictureFace = typeof PictureFaceSchema.Type;

export const MomentPictureSchema = Schema.Struct({
  also: Schema.String,
  boards: Schema.Array(Schema.Array(Schema.String)),
  faces: Schema.Array(PictureFaceSchema),
  kind: MomentKindSchema,
  lifted: Schema.Array(Schema.String),
  line: Schema.String,
  painful: Schema.Boolean,
  pot: Schema.Int,
  tier: Schema.Literals([1, 2, 3]),
  title: Schema.String,
});

export type MomentPicture = typeof MomentPictureSchema.Type;
