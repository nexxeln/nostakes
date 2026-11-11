import { Schema } from "effect";

import { LandingPictureSchema } from "../../features/landing/elements.js";
import { ThemeSchema } from "../../features/model.js";

export const DrawnPictureSchema = Schema.String.pipe(
  Schema.brand("DrawnLandingPicture")
);

export type DrawnPicture = typeof DrawnPictureSchema.Type;

export const CARD_PART = "card";

export const PictureRequestSchema = Schema.Struct({
  picture: LandingPictureSchema,
  scale: Schema.Finite,
  theme: ThemeSchema,
});

export type PictureRequest = typeof PictureRequestSchema.Type;

export const MotionPlanSchema = Schema.Struct({
  keyframes: Schema.Array(
    Schema.Struct({
      offset: Schema.Finite,
      opacity: Schema.String,
      transform: Schema.String,
    })
  ),
  length: Schema.Finite,
  part: Schema.String,
});

export type MotionPlan = typeof MotionPlanSchema.Type;

export const PictureReplySchema = Schema.Struct({
  drawn: DrawnPictureSchema,
  motions: Schema.Array(MotionPlanSchema),
});

export type PictureReply = typeof PictureReplySchema.Type;
