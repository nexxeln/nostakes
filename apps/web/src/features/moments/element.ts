import { PlayerIdSchema } from "@nostakes/engine";
import {
  AvatarSchema,
  LastHandViewSchema,
  MomentCalloutsSchema,
  NameSchema,
  SeenTableEventSchema,
} from "@nostakes/room";
import { Schema } from "effect";
import { CustomElement } from "foldkit";

import { DeckSchema, ThemeSchema } from "../model.js";
import { HandNoteSchema, SeatStackSchema } from "./watch.js";

export const MOMENT_TAG = "nostakes-moment";

export const PersonSchema = Schema.Struct({
  avatar: AvatarSchema,
  name: NameSchema,
  player: PlayerIdSchema,
});

export type Person = typeof PersonSchema.Type;

export const MomentHandSchema = Schema.Struct({
  callouts: MomentCalloutsSchema,
  deck: DeckSchema,
  lastHand: LastHandViewSchema,
  notes: Schema.optionalKey(Schema.Array(HandNoteSchema)),
  people: Schema.Array(PersonSchema),
  record: Schema.Array(SeenTableEventSchema),
  stacks: Schema.optionalKey(Schema.Array(SeatStackSchema)),
  theme: ThemeSchema,
});

export type MomentHand = typeof MomentHandSchema.Type;

export const momentElement = CustomElement.define({
  events: {},
  properties: {
    dealing: Schema.Boolean,
    hand: Schema.NullOr(MomentHandSchema),
    sound: Schema.Boolean,
  },
  tag: MOMENT_TAG,
});
