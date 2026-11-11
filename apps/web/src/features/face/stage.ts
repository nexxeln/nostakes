import { AvatarSchema, ExpressionSchema, PartSchema } from "@nostakes/avatar";
import { Schema } from "effect";
import { CustomElement } from "foldkit";

import { ThemeSchema } from "../model.js";

export const FACE_TAG = "nostakes-face";

export const MODAL_TAG = "nostakes-modal";

export const FaceHoldSchema = Schema.Struct({ part: PartSchema });

export type FaceHold = typeof FaceHoldSchema.Type;

export const FaceFlipSchema = Schema.Struct({
  by: Schema.Int,
  part: PartSchema,
});

export type FaceFlip = typeof FaceFlipSchema.Type;

export const faceElement = CustomElement.define({
  events: { flip: FaceFlipSchema, hold: FaceHoldSchema },
  properties: {
    face: AvatarSchema,
    held: PartSchema,
    hint: Schema.Boolean,
    mood: ExpressionSchema,
    shuffles: Schema.Int,
    theme: ThemeSchema,
  },
  tag: FACE_TAG,
});

export const ModalCancelSchema = Schema.Struct({
  by: Schema.Literal("Escape"),
});

export type ModalCancel = typeof ModalCancelSchema.Type;

export const modalElement = CustomElement.define({
  events: { cancel: ModalCancelSchema },
  properties: { opener: Schema.String },
  tag: MODAL_TAG,
});
