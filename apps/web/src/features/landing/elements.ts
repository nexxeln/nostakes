import { ExpressionSchema } from "@nostakes/avatar";
import { Schema } from "effect";
import { CustomElement } from "foldkit";

import { ThemeSchema } from "../model.js";

export const LANDING_TAG = "nostakes-landing";

export const LANDING_FACE_TAG = "nostakes-landing-face";

export const LANDING_PICTURE_TAG = "nostakes-landing-picture";

export const LandingPictureSchema = Schema.Literals(["Moment", "SettleUp"]);

export type LandingPicture = typeof LandingPictureSchema.Type;

export const landingElement = CustomElement.define({
  events: {},
  properties: {},
  tag: LANDING_TAG,
});

export const landingFaceElement = CustomElement.define({
  events: {},
  properties: {
    avatar: Schema.String,
    expression: ExpressionSchema,
    shuffles: Schema.Boolean,
    theme: ThemeSchema,
  },
  tag: LANDING_FACE_TAG,
});

export const landingPictureElement = CustomElement.define({
  events: {},
  properties: {
    picture: LandingPictureSchema,
  },
  tag: LANDING_PICTURE_TAG,
});
