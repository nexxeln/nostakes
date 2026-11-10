import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import type { Brand } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  RunCountSchema,
  ShownCardsSchema,
  TableConfigSchema,
  TableStates,
} from "../../src/index.js";
import type {
  Card,
  Command,
  TableConfig,
  TableState,
} from "../../src/index.js";
import { baseConfig, chipCount } from "../fixtures.js";
import { playSession, session } from "../sessions.js";
import { commandMatrix, startCommands, totalityProblems } from "./matrix.js";

const restingPhase = (state: TableState) =>
  TableStates.$is("InHand")(state)
    ? state.hand.phase._tag
    : `BetweenHands${Option.isSome(state.lastHand) ? "AfterAHand" : ""}`;

const probe = (
  source: typeof session extends Arbitrary.Arbitrary<infer A> ? A : never
) => {
  const played = playSession(source);
  const sampled = played.steps.filter((_, index) => index % 7 === 0);

  return {
    phases: sampled.map((step) => restingPhase(step.before)),
    problems: sampled.flatMap((step) =>
      [...commandMatrix(step.before), ...startCommands(step.command)].flatMap(
        (command) => totalityProblems(step.before, command)
      )
    ),
  };
};

type FieldOf<
  Tag extends Command["_tag"],
  Key extends keyof Extract<Command, { readonly _tag: Tag }>,
> = Extract<Command, { readonly _tag: Tag }>[Key];

describe("the Command type admits only what CommandSchema admits", () => {
  it("Rule 19: a run count is an integer from 1 to MAX_RUNS, so ChooseRuns with 1.5 runs or a table with maxRuns 1.5 does not typecheck", () => {
    expectTypeOf<number>().not.toExtend<FieldOf<"ChooseRuns", "runs">>();
    expectTypeOf<number>().not.toExtend<TableConfig["maxRuns"]>();
    expect(
      [0, 1, 1.5, 9, 10, Number.NaN].map((count) =>
        Schema.is(RunCountSchema)(count)
      )
    ).toStrictEqual([false, true, false, true, false, false]);
  });

  it("Rule 26: a show is one or two distinct cards, so ShowCards with no card or one card twice does not typecheck", () => {
    expectTypeOf<readonly Card[]>().not.toExtend<
      FieldOf<"ShowCards", "cards">
    >();
    expect(
      [[], [0], [0, 1], [0, 0], [0, 1, 2]].map((shown) =>
        Schema.is(ShownCardsSchema)(shown)
      )
    ).toStrictEqual([false, true, true, false, false]);
  });

  it("Rule 7: table rules come only from TableConfigSchema, so a ChangeRules config literal with the small blind above the big blind does not typecheck", () => {
    expectTypeOf<
      Omit<TableConfig, keyof Brand.Brand<"TableConfig">>
    >().not.toExtend<FieldOf<"ChangeRules", "config">>();
    expect(
      [
        baseConfig,
        { ...baseConfig, smallBlind: chipCount(20) },
        { ...baseConfig, bigBlind: chipCount(0), smallBlind: chipCount(0) },
      ].map((config) => Schema.is(TableConfigSchema)(config))
    ).toStrictEqual([true, false, false]);
  });
});

describe("totality of decide over every command in every resting phase", () => {
  it.prop(
    "decide never throws, and every accepted command evolves cleanly, keeps the invariants, and moves chips only by buy-ins",
    { source: session },
    ({ source }) => {
      expect(probe(source).problems).toStrictEqual([]);
    },
    { arbitrary: { runs: 25 }, timeout: 300_000 }
  );

  it.effect(
    "the probe reaches every resting phase: between hands, after a hand, betting, and choosing runs",
    () =>
      Effect.gen(function* everyPhase() {
        const sources = yield* Arbitrary.sampleEffect(session, {
          count: 12,
          seed: 1110,
        });

        const phases = new Set(
          sources.flatMap((source) => probe(source).phases)
        );

        expect([...phases].toSorted()).toStrictEqual([
          "Betting",
          "BetweenHands",
          "BetweenHandsAfterAHand",
          "ChoosingRuns",
        ]);
      })
  );
});
