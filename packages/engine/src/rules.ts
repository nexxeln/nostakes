import { Data, Schema } from "effect";

import { PositiveChipsSchema } from "./primitives.js";

export const MAX_RUNS = 9;

export const MAX_UNDER_THE_GUN_STRADDLES = 6;

export const AnteSchema = Schema.TaggedUnion({
  BigBlindPays: { amount: PositiveChipsSchema },
  EveryPlayer: { amount: PositiveChipsSchema },
  NoAnte: {},
});

export type Ante = typeof AnteSchema.Type;

export const Antes = Data.taggedEnum<Ante>();

export const StraddleRulesSchema = Schema.Struct({
  button: Schema.Boolean,
  underTheGun: Schema.Int.check(
    Schema.isBetween({ maximum: MAX_UNDER_THE_GUN_STRADDLES, minimum: 0 })
  ),
});

export type StraddleRules = typeof StraddleRulesSchema.Type;

export const TableConfigSchema = Schema.Struct({
  ante: AnteSchema,
  bigBlind: PositiveChipsSchema,
  maxRuns: Schema.Int.check(
    Schema.isBetween({ maximum: MAX_RUNS, minimum: 1 })
  ),
  rabbitHunt: Schema.Boolean,
  smallBlind: PositiveChipsSchema,
  straddle: StraddleRulesSchema,
}).check(
  Schema.makeFilter((config) =>
    config.smallBlind <= config.bigBlind
      ? undefined
      : "the small blind must not exceed the big blind"
  )
);

export type TableConfig = typeof TableConfigSchema.Type;
