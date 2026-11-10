import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { TableStates } from "../../src/index.js";
import type { TableState } from "../../src/index.js";
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
