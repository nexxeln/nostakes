import { Data, Schema } from "effect";
import { CustomElement } from "foldkit";

import { DeckSchema, ThemeSchema } from "../model.js";
import { RecapCardSchema } from "../recap.js";
import type { PictureLook } from "./paper.js";
import { recapSvg } from "./recap-card.js";
import { SettleUpCardSchema, settleUpSvg } from "./settle-up.js";

export const KEEP_TAG = "nostakes-keep";

export const KeepPictureSchema = Schema.TaggedUnion({
  Recap: RecapCardSchema.fields,
  SettleUp: SettleUpCardSchema.fields,
});

export type KeepPicture = typeof KeepPictureSchema.Type;

export const KeepPictures = Data.taggedEnum<KeepPicture>();

export const keepSvg = (picture: KeepPicture, look: PictureLook) =>
  KeepPictures.$match(picture, {
    Recap: (card) => recapSvg(card, look),
    SettleUp: (card) => settleUpSvg(card, look),
  });

export const keepTitle = (picture: KeepPicture) =>
  KeepPictures.$match(picture, {
    Recap: () => "tonight",
    SettleUp: () => "settle up",
  });

export const KeepToneSchema = Schema.Literals(["Primary", "Quiet"]);

export type KeepTone = typeof KeepToneSchema.Type;

export const keepElement = CustomElement.define({
  events: {},
  properties: {
    deck: DeckSchema,
    label: Schema.String,
    picture: Schema.NullOr(KeepPictureSchema),
    theme: ThemeSchema,
    tone: KeepToneSchema,
  },
  tag: KEEP_TAG,
});
