import { Data, Option, Schema } from "effect";

import { CHIP_LIMIT, PositiveChipsSchema, chips } from "./primitives.js";
import type { Chips } from "./primitives.js";

export const MAX_RUNS = 9;

export const MAX_UNDER_THE_GUN_STRADDLES = 6;

export const RunCountSchema = Schema.Int.check(
  Schema.isBetween({ maximum: MAX_RUNS, minimum: 1 })
).pipe(Schema.brand("RunCount"));

export type RunCount = typeof RunCountSchema.Type;

export const ONE_RUN = RunCountSchema.make(1);

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

export const ShowdownRuleSchema = Schema.Literals(["Automatic", "Interactive"]);

export type ShowdownRule = typeof ShowdownRuleSchema.Type;

export const TableConfigSchema = Schema.Struct({
  ante: AnteSchema,
  bigBlind: PositiveChipsSchema,
  maxRuns: RunCountSchema,
  rabbitHunt: Schema.Boolean,
  showdown: ShowdownRuleSchema,
  smallBlind: PositiveChipsSchema,
  straddle: StraddleRulesSchema,
})
  .check(
    Schema.makeFilter((config) =>
      config.smallBlind <= config.bigBlind
        ? undefined
        : "the small blind must not exceed the big blind"
    )
  )
  .pipe(Schema.brand("TableConfig"));

export type TableConfig = typeof TableConfigSchema.Type;

export const straddleAmount = (
  config: TableConfig,
  position: number
): Option.Option<Chips> => {
  let amount: number = config.bigBlind;

  for (let doubling = 0; doubling <= position; doubling += 1) {
    if (amount > CHIP_LIMIT - amount) {
      return Option.none();
    }

    amount += amount;
  }

  return Option.some(chips(amount));
};

export const longestStraddleChain = (config: TableConfig) =>
  Math.max(config.straddle.underTheGun, config.straddle.button ? 1 : 0);
