import * as Cloudflare from "@alchemy.run/cloudflare";
import { Stage } from "alchemy";
import { Cause, Effect, Option } from "effect";
import { constVoid } from "effect/Function";

import { datasetName, pointOf } from "./measures.js";
import type { DataPoint, Measure } from "./measures.js";

export interface AnalyticsSink<R = never> {
  readonly write: (
    points: readonly DataPoint[]
  ) => Effect.Effect<void, never, R>;
}

export const noAnalytics: AnalyticsSink = { write: () => Effect.void };

export const ANALYTICS_BINDING = "ANALYTICS";

interface DatasetBinding {
  readonly writeDataPoint: (point: {
    indexes: string[];
    blobs: string[];
    doubles: number[];
  }) => void;
}

export const sinkFromDataset = <R>(
  dataset: Effect.Effect<DatasetBinding, never, R>
): AnalyticsSink<R> => ({
  write: (points) =>
    dataset.pipe(
      Effect.flatMap((binding) =>
        Effect.sync(() => {
          for (const point of points) {
            binding.writeDataPoint({
              blobs: [...point.blobs],
              doubles: [...point.doubles],
              indexes: [...point.indexes],
            });
          }
        })
      )
    ),
});

export const analyticsDataset = Effect.gen(function* analyticsDataset() {
  const stage = yield* Stage;

  const dataset = yield* Cloudflare.AnalyticsEngine.Dataset(ANALYTICS_BINDING, {
    dataset: datasetName(stage),
  });

  const client = yield* Cloudflare.AnalyticsEngine.WriteDataset(dataset);

  return sinkFromDataset(client.raw);
}).pipe(Effect.provide(Cloudflare.AnalyticsEngine.WriteDatasetBinding));

export const ANALYTICS_FAULT =
  "an analytics write failed; the game goes on, and later failures here are not logged";

export const recorder = <R>(
  sink: AnalyticsSink<R>,
  scope: string,
  noticed: (text: string) => void = constVoid
): Recorder<R> => {
  let warned = false;

  const warnOnce = (cause: Cause.Cause<unknown>) =>
    warned
      ? Effect.void
      : Effect.sync(() => {
          warned = true;
          noticed(ANALYTICS_FAULT);
        }).pipe(
          Effect.andThen(
            Effect.logWarning(ANALYTICS_FAULT, { cause: Cause.pretty(cause) })
          )
        );

  return (measures: readonly Measure[]) =>
    measures.length === 0
      ? Effect.void
      : sink
          .write(measures.map((measured) => pointOf(scope, measured)))
          .pipe(
            Effect.catchCause(warnOnce),
            Effect.forkDetach({ startImmediately: true }),
            Effect.asVoid
          );
};

export type Recorder<R = never> = (
  measures: readonly Measure[]
) => Effect.Effect<void, never, R>;

export interface RoomMeasures<Event, Tally> {
  readonly empty: Tally;
  readonly measure: (
    tally: Tally,
    event: Event,
    device: Option.Option<string>
  ) => readonly [Tally, readonly Measure[]];
  readonly abandoned: (tally: Tally) => Option.Option<Measure>;
}

export const noMeasures: RoomMeasures<unknown, null> = {
  abandoned: () => Option.none(),
  empty: null,
  measure: (tally) => [tally, []],
};

export const measureAll = <Event, Tally>(
  measures: RoomMeasures<Event, Tally>,
  tally: Tally,
  events: readonly Event[],
  device: Option.Option<string>
): readonly [Tally, readonly Measure[]] => {
  let next = tally;
  const found: Measure[] = [];

  for (const event of events) {
    const [after, measured] = measures.measure(next, event, device);

    next = after;
    found.push(...measured);
  }

  return [next, found];
};
