import { Data, Schema } from "effect";
import { CustomElement } from "foldkit";

import { DeckSchema, ThemeSchema } from "../model.js";
import type { PictureLook } from "./paper.js";
import { SettleUpCardSchema, settleUpSvg } from "./settle-up.js";

export const KEEP_TAG = "nostakes-keep";

export const KeepPictureSchema = Schema.TaggedUnion({
  SettleUp: SettleUpCardSchema.fields,
});

export type KeepPicture = typeof KeepPictureSchema.Type;

export const KeepPictures = Data.taggedEnum<KeepPicture>();

export const keepSvg = (picture: KeepPicture, look: PictureLook) =>
  KeepPictures.$match(picture, {
    SettleUp: (card) => settleUpSvg(card, look),
  });

export const keepTitle = (picture: KeepPicture) =>
  KeepPictures.$match(picture, { SettleUp: () => "settle up" });

export const keepElement = CustomElement.define({
  events: {},
  properties: {
    deck: DeckSchema,
    label: Schema.String,
    picture: Schema.NullOr(KeepPictureSchema),
    theme: ThemeSchema,
  },
  tag: KEEP_TAG,
});
