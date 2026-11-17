import { Schema } from "effect";
import { CustomElement } from "foldkit";

import { DeckSchema, ThemeSchema } from "../model.js";
import { SettleUpCardSchema } from "../pictures/settle-up.js";

export const TONIGHT_TAG = "nostakes-tonight";

export const TonightModeSchema = Schema.Literals(["Drawer", "Settled"]);

export type TonightMode = typeof TonightModeSchema.Type;

export const TonightCloseSchema = Schema.Struct({ by: Schema.Literal("Done") });

export const tonightElement = CustomElement.define({
  events: { close: TonightCloseSchema },
  properties: {
    deck: DeckSchema,
    mode: TonightModeSchema,
    room: Schema.String,
    settled: Schema.NullOr(SettleUpCardSchema),
    theme: ThemeSchema,
  },
  tag: TONIGHT_TAG,
});
