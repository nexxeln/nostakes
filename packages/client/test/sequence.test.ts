import { describe, expect, it } from "@effect/vitest";
import { MAX_MISSED_EVENTS } from "@nostakes/protocol";
import { Array as Arr, Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { BatchFits, fitBatch, fitWelcome, WelcomeFits } from "../src/index.js";
import type { WelcomeFit, WelcomeSpan } from "../src/index.js";

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
});

const spanOf = (
  seq: number,
  start: number,
  skippedTo: number
): WelcomeSpan => ({
  missedCount: seq - skippedTo,
  missedFrom: skippedTo + 1,
  seq,
  skipped:
    skippedTo >= start
      ? Option.some({ from: start, to: skippedTo })
      : Option.none(),
});

const serverCatchUp = (applied: number, head: number): WelcomeSpan => {
  if (head <= applied) {
    return spanOf(head, head + 1, head);
  }

  return head - applied > MAX_MISSED_EVENTS
    ? spanOf(head, applied + 1, head)
    : spanOf(head, applied + 1, applied);
};

const coveredBy = (fit: WelcomeFit, span: WelcomeSpan) =>
  WelcomeFits.$match(fit, {
    Gap: ({ from }) => [`gap at ${from}`],
    Malformed: ({ from }) => [`malformed at ${from}`],
    Resume: ({ keepFrom, skipped }) => [
      ...Option.toArray(skipped).flatMap(({ from, to }) => Arr.range(from, to)),
      ...Array.from(
        { length: span.missedCount - keepFrom },
        (_, index) => span.missedFrom + keepFrom + index
      ),
    ],
  });

describe("welcome", () => {
  it.prop(
    "a resume covers every sequence number after the last applied one exactly once, as events or as one skipped range",
    { applied: Count, head: Count },
    ({ applied, head }) => {
      const span = serverCatchUp(applied, head);

      expect(coveredBy(fitWelcome(Option.some(applied), span), span)).toEqual(
        head > applied ? Arr.range(applied + 1, head) : []
      );
    }
  );

  it.prop(
    "whatever split of skipped and missed the server names, a catch-up that starts by the next expected event applies nothing twice and leaves no hole",
    { applied: Count, length: Count, split: Count, start: Count },
    ({ applied, length, split, start }) => {
      const from = 1 + (start % (applied + 1));
      const seq = from - 1 + length;
      const span = spanOf(seq, from, from - 1 + (split % (length + 1)));

      expect(coveredBy(fitWelcome(Option.some(applied), span), span)).toEqual(
        seq > applied ? Arr.range(applied + 1, seq) : []
      );
    }
  );

  it.prop(
    "a catch-up that starts past the next expected event is a gap, never a silent skip",
    { ahead: Small, applied: Count, length: Count },
    ({ ahead, applied, length }) => {
      const from = applied + 1 + ahead;
      const span = spanOf(from - 1 + length, from, from - 1);

      expect(fitWelcome(Option.some(applied), span)).toEqual(
        WelcomeFits.Gap({ expected: applied + 1, from })
      );
    }
  );

  it("a catch-up whose ranges do not end at the head, or do not meet, is malformed", () => {
    const short = {
      missedCount: 2,
      missedFrom: 6,
      seq: 9,
      skipped: Option.none(),
    };

    const apart = {
      missedCount: 2,
      missedFrom: 8,
      seq: 9,
      skipped: Option.some({ from: 3, to: 5 }),
    };

    expect(fitWelcome(Option.some(5), short)).toEqual(
      WelcomeFits.Malformed({ from: 6, seq: 9, size: 2 })
    );
    expect(fitWelcome(Option.some(2), apart)).toEqual(
      WelcomeFits.Malformed({ from: 3, seq: 9, size: 2 })
    );
  });
});
