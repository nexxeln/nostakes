import { describe, expect, it } from "@effect/vitest";
import { Effect, Random, Schema } from "effect";

import {
  BACKOFF_CAP_MS,
  BACKOFF_FIRST_MS,
  backoffWindow,
  drawBackoff,
} from "../src/index.js";

const Attempt = Schema.Int.check(Schema.isBetween({ maximum: 64, minimum: 0 }));

const Draw = Schema.Finite.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThan(1)
);

const scriptedRandom = (draw: number) =>
  Effect.provideService(Random.Random, {
    nextDoubleUnsafe: () => draw,
    nextIntUnsafe: () => 0,
  });

describe("backoff", () => {
  it("starts at 250 milliseconds and doubles up to the 10 second cap", () => {
    expect(
      Array.from(
        { length: 8 },
        (_, attempt) => backoffWindow(attempt).longestMs
      )
    ).toEqual([250, 500, 1000, 2000, 4000, 8000, 10_000, 10_000]);
  });

  it.prop(
    "never shrinks from one attempt to the next and never passes the cap",
    { attempt: Attempt },
    ({ attempt }) => {
      const now = backoffWindow(attempt);
      const next = backoffWindow(attempt + 1);

      expect(next.longestMs).toBeGreaterThanOrEqual(now.longestMs);
      expect(next.shortestMs).toBeGreaterThanOrEqual(now.shortestMs);
      expect(now.longestMs).toBeLessThanOrEqual(BACKOFF_CAP_MS);
      expect(now.shortestMs).toBeGreaterThanOrEqual(BACKOFF_FIRST_MS / 2);
      expect(now.shortestMs * 2).toBeGreaterThanOrEqual(now.longestMs);
    }
  );

  it.effect.prop(
    "jitter lands inside the window for every random draw",
    { attempt: Attempt, draw: Draw },
    ({ attempt, draw }) =>
      Effect.gen(function* jitterInWindow() {
        const { longestMs, shortestMs } = backoffWindow(attempt);
        const delayMs = yield* drawBackoff(attempt).pipe(scriptedRandom(draw));

        expect(Number.isInteger(delayMs)).toBe(true);
        expect(delayMs).toBeGreaterThanOrEqual(shortestMs);
        expect(delayMs).toBeLessThanOrEqual(longestMs);
      })
  );

  it.effect("the lowest and highest draws reach both ends of the window", () =>
    Effect.gen(function* windowEnds() {
      const lowest = yield* drawBackoff(3).pipe(scriptedRandom(0));

      const highest = yield* drawBackoff(3).pipe(
        scriptedRandom(1 - Number.EPSILON)
      );

      expect([lowest, highest]).toEqual([1000, 2000]);
    })
  );
});
