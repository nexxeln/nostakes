import { Data, Schema } from "effect";

import { ChipsSchema, SeatIndexSchema } from "./primitives.js";

export const ActionSchema = Schema.TaggedUnion({
  Call: {},
  Check: {},
  Fold: {},
  RaiseTo: { to: ChipsSchema },
});

export type Action = typeof ActionSchema.Type;

export const Actions = Data.taggedEnum<Action>();

export const RaiseRangeSchema = Schema.Struct({
  maxTo: ChipsSchema,
  minTo: ChipsSchema,
});

export type RaiseRange = typeof RaiseRangeSchema.Type;

export const LegalActionsSchema = Schema.Struct({
  call: Schema.Option(ChipsSchema),
  canCheck: Schema.Boolean,
  raise: Schema.Option(RaiseRangeSchema),
  seat: SeatIndexSchema,
});

export type LegalActions = typeof LegalActionsSchema.Type;
