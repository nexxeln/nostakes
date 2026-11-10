import { Data, Option, Schema } from "effect";

import { CHIP_LIMIT, PositiveChipsSchema, chips } from "./primitives.js";
import type { Chips } from "./primitives.js";
import { setting } from "./setting.js";

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
  button: Schema.Boolean.annotate({
    description:
      "The player on the button may straddle, posting twice the big blind and acting last before the flop.",
    title: "Button straddle",
  }),
  underTheGun: Schema.Int.check(
    Schema.isBetween({ maximum: MAX_UNDER_THE_GUN_STRADDLES, minimum: 0 })
  ).annotate({
    description:
      "How many players in a row after the big blind may straddle. 0 turns the under-the-gun straddle off.",
    title: "Under-the-gun straddles",
  }),
});

export type StraddleRules = typeof StraddleRulesSchema.Type;

export const ShowdownRuleSchema = Schema.Literals(["Automatic", "Interactive"]);

export type ShowdownRule = typeof ShowdownRuleSchema.Type;

export const StraddleSizeSchema = Schema.Literals(["Doubling", "TwoBigBlinds"]);

export type StraddleSize = typeof StraddleSizeSchema.Type;

export const RunCountRuleSchema = Schema.Literals(["Vote", "Fixed"]);

export type RunCountRule = typeof RunCountRuleSchema.Type;

export const AllInHandsSchema = Schema.Literals(["FaceUp", "Hidden"]);

export type AllInHands = typeof AllInHandsSchema.Type;

export const TableConfigSchema = Schema.Struct({
  allInHands: setting(AllInHandsSchema, "FaceUp", {
    description:
      "FaceUp turns every hand still in face up before the rest of the board is dealt to players all in. Hidden keeps the hands down until the board is complete; then they are shown or mucked as the showdown rule says, or, when the board ran more than once, each hand is shown if it can win or tie part of a pot on some run.",
    title: "Hands when all in",
  }),
  ante: AnteSchema.annotate({
    description:
      "No ante, an ante from every player dealt in, or one ante paid by the big blind for the table.",
    title: "Ante",
  }),
  bigBlind: PositiveChipsSchema.annotate({
    description: "Chips the big blind posts before the cards are dealt.",
    title: "Big blind",
  }),
  maxRuns: RunCountSchema.annotate({
    description:
      "The most times the rest of the board can be run when players are all in. 1 turns the run vote off.",
    title: "Most runs",
  }),
  rabbitHunt: Schema.Boolean.annotate({
    description:
      "After a hand ends early, a player dealt in may reveal the board cards that were never dealt.",
    title: "Rabbit hunt",
  }),
  runCount: setting(RunCountRuleSchema, "Vote", {
    description:
      "How many times the board runs when players are all in. Vote: every seat still in picks up to the most runs and the fewest picked wins. Fixed: no vote, the board always runs the most runs the deck allows.",
    title: "Runs when all in",
  }),
  showdown: setting(ShowdownRuleSchema, "Automatic", {
    description:
      "Automatic shows the first hand and then each hand that can win or tie. Interactive asks each seat in turn to table or muck.",
    title: "Showdown",
  }),
  smallBlind: PositiveChipsSchema.annotate({
    description:
      "Chips the small blind posts. It may not exceed the big blind.",
    title: "Small blind",
  }),
  straddle: StraddleRulesSchema.annotate({
    description: "Which voluntary straddles players may post.",
    title: "Straddles",
  }),
  straddleSize: setting(StraddleSizeSchema, "Doubling", {
    description:
      "Doubling: each straddle is twice the one before, so two, four, then eight big blinds. TwoBigBlinds: every straddle is two big blinds.",
    title: "Straddle size",
  }),
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
  const doublings = config.straddleSize === "Doubling" ? position : 0;

  for (let doubling = 0; doubling <= doublings; doubling += 1) {
    if (amount > CHIP_LIMIT - amount) {
      return Option.none();
    }

    amount += amount;
  }

  return Option.some(chips(amount));
};

export const longestStraddleChain = (config: TableConfig) =>
  Math.max(config.straddle.underTheGun, config.straddle.button ? 1 : 0);
