import { describe, expect, it } from "@effect/vitest";
import { MAX_MISSED_EVENTS } from "@nostakes/protocol";
import { Array as Arr, Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { BatchFits, fitBatch, fitWelcome } from "../src/index.js";

const Count = Schema.Int.check(Schema.isBetween({ maximum: 400, minimum: 0 }));

const Small = Schema.Int.check(Schema.isBetween({ maximum: 12, minimum: 1 }));

const deliveries = Arbitrary.array(
  Arbitrary.all([Arbitrary.schema(Small), Arbitrary.schema(Small)]),
  { maxLength: 60, minLength: 1 }
);

interface Batch {
  readonly from: number;
  readonly to: number;
}

const batchesOf = (plan: readonly (readonly [number, number])[]) => {
  const log: Batch[] = [];
  let head = 0;

  for (const [size] of plan) {
    log.push({ from: head + 1, to: head + size });
    head += size;
  }

  return { head, log };
};

const deliver = (
  log: readonly Batch[],
  plan: readonly (readonly [number, number])[]
) =>
  plan.map(([, pick], index) => {
    const at = Math.max(0, index + (pick % 5) - 2);

    return log[at] ?? log[index] ?? { from: 1, to: 1 };
  });

describe("batches", () => {
  it.prop(
    "whatever order and repetition batches arrive in, applied sequence numbers run 1, 2, 3 and never repeat",
    { plan: deliveries },
    ({ plan }) => {
      const { log } = batchesOf(plan);
      const applied: number[] = [];
      let last = 0;

      for (const { from, to } of deliver(log, plan)) {
        const fit = fitBatch(last, from, to, to - from + 1);

        if (BatchFits.$is("Gap")(fit)) {
          break;
        }

        if (BatchFits.$is("Fresh")(fit)) {
          applied.push(...Arr.range(from, to).slice(fit.skip));

          last = to;
        }
      }

      expect(applied).toEqual(
        Array.from({ length: applied.length }, (_, index) => index + 1)
      );
    }
  );

  it("a batch from the past is stale and one from the future is a gap", () => {
    expect(fitBatch(10, 4, 6, 3)).toEqual(BatchFits.Stale({ to: 6 }));
    expect(fitBatch(10, 11, 12, 2)).toEqual(BatchFits.Fresh({ skip: 0 }));
    expect(fitBatch(10, 9, 12, 4)).toEqual(BatchFits.Fresh({ skip: 2 }));
    expect(fitBatch(10, 12, 12, 1)).toEqual(
      BatchFits.Gap({ expected: 11, from: 12 })
    );
    expect(fitBatch(10, 11, 12, 1)).toEqual(
      BatchFits.Malformed({ from: 11, size: 1, to: 12 })
    );
  });
});

describe("welcome", () => {
  it.prop(
    "a resume covers every sequence number after the last applied one exactly once, as events or as one skipped range",
    { applied: Count, head: Count },
    ({ applied, head }) => {
      const missed =
        head <= applied || head - applied > MAX_MISSED_EVENTS
          ? 0
          : head - applied;

      const fit = fitWelcome(Option.some(applied), head, missed);

      const covered = [
        ...Option.toArray(fit.skipped).flatMap(({ from, to }) =>
          Arr.range(from, to)
        ),
        ...Array.from(
          { length: missed - fit.keepFrom },
          (_, index) => fit.firstMissed + fit.keepFrom + index
        ),
      ];

      expect(covered).toEqual(
        head > applied ? Arr.range(applied + 1, head) : []
      );
    }
  );

  it.prop(
    "missed events the client already applied are never applied again",
    { applied: Count, head: Count, missed: Count },
    ({ applied, head, missed }) => {
      const size = Math.min(missed, head);
      const fit = fitWelcome(Option.some(applied), head, size);
      const firstKept = fit.firstMissed + fit.keepFrom;

      expect(fit.keepFrom).toBeLessThanOrEqual(size);
      expect(fit.keepFrom === size || firstKept > applied).toBe(true);
    }
  );

  it("a first hello skips nothing", () => {
    expect(fitWelcome(Option.none(), 42, 0)).toEqual({
      firstMissed: 43,
      keepFrom: 0,
      skipped: Option.none(),
    });
  });
});
