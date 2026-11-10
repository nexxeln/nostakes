import type * as cf from "@cloudflare/workers-types";
import { Clock, Effect, Match, Option, Schema } from "effect";

import type { AnalyticsSink } from "../../src/analytics.js";
import { StampedPointSchema } from "../../src/measures.js";
import type { DataPoint, StampedPoint } from "../../src/measures.js";

export const AnalyticsModeSchema = Schema.Literals(["Record", "Fail", "Hang"]);

export type AnalyticsMode = typeof AnalyticsModeSchema.Type;

const MODE_KEY = "test-analytics-mode";

const COUNT_KEY = "test-analytics-count";

const POINT_PREFIX = "test-analytics-point:";

const decodeMode = Schema.decodeUnknownOption(AnalyticsModeSchema);

const decodeCount = Schema.decodeUnknownOption(Schema.Int);

const decodeStamped = Schema.decodeUnknownOption(StampedPointSchema);

export class AnalyticsRefused extends Schema.TaggedError<
  AnalyticsRefused,
  { readonly brand: unique symbol }
>()("AnalyticsRefused", { points: Schema.Int }) {
  override get message() {
    return `The test sink refused ${this.points} data points because the test set it to fail.`;
  }
}

export const storedAnalytics = (state: cf.DurableObjectState) => ({
  mode: (): AnalyticsMode =>
    Option.getOrElse(
      decodeMode(state.storage.kv.get(MODE_KEY)),
      (): AnalyticsMode => "Record"
    ),
  points: (): readonly StampedPoint[] =>
    [...state.storage.kv.list({ prefix: POINT_PREFIX })].flatMap(([, value]) =>
      Option.toArray(decodeStamped(value))
    ),
  setMode: (mode: AnalyticsMode) => {
    state.storage.kv.put(MODE_KEY, mode);
  },
});

const keep = (state: cf.DurableObjectState, at: number, point: DataPoint) => {
  const count =
    Option.getOrElse(decodeCount(state.storage.kv.get(COUNT_KEY)), () => 0) + 1;

  state.storage.kv.put(COUNT_KEY, count);
  state.storage.kv.put(
    `${POINT_PREFIX}${String(count).padStart(8, "0")}`,
    Schema.encodeSync(StampedPointSchema)({ at, point })
  );
};

export const objectAnalytics = (
  state: cf.DurableObjectState
): AnalyticsSink => ({
  write: (points) =>
    Effect.suspend(() =>
      Match.value(storedAnalytics(state).mode()).pipe(
        Match.when("Hang", () => Effect.never),
        Match.when("Fail", () =>
          Effect.die(new AnalyticsRefused({ points: points.length }))
        ),
        Match.when("Record", () =>
          Clock.currentTimeMillis.pipe(
            Effect.flatMap((at) =>
              Effect.sync(() => {
                for (const point of points) {
                  keep(state, at, point);
                }
              })
            )
          )
        ),
        Match.exhaustive
      )
    ),
});

export const memoryAnalytics = () => {
  const kept: StampedPoint[] = [];

  const sink: AnalyticsSink = {
    write: (points) =>
      Clock.currentTimeMillis.pipe(
        Effect.flatMap((at) =>
          Effect.sync(() => {
            kept.push(...points.map((point) => ({ at, point })));
          })
        )
      ),
  };

  return { points: (): readonly StampedPoint[] => [...kept], sink };
};
