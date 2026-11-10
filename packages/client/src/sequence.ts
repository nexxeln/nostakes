import { Data, Option } from "effect";

export type BatchFit = Data.TaggedEnum<{
  Fresh: { readonly skip: number };
  Stale: { readonly to: number };
  Gap: { readonly expected: number; readonly from: number };
  Malformed: {
    readonly from: number;
    readonly to: number;
    readonly size: number;
  };
}>;

export const BatchFits = Data.taggedEnum<BatchFit>();

export const fitBatch = (
  applied: number,
  from: number,
  to: number,
  size: number
): BatchFit => {
  if (size === 0 || to - from + 1 !== size) {
    return BatchFits.Malformed({ from, size, to });
  }

  if (to <= applied) {
    return BatchFits.Stale({ to });
  }

  if (from > applied + 1) {
    return BatchFits.Gap({ expected: applied + 1, from });
  }

  return BatchFits.Fresh({ skip: applied + 1 - from });
};

export interface SkippedRange {
  readonly from: number;
  readonly to: number;
}

export interface WelcomeSpan {
  readonly seq: number;
  readonly missedFrom: number;
  readonly missedCount: number;
  readonly skipped: Option.Option<SkippedRange>;
}

export type WelcomeFit = Data.TaggedEnum<{
  Resume: {
    readonly keepFrom: number;
    readonly skipped: Option.Option<SkippedRange>;
  };
  Gap: { readonly expected: number; readonly from: number };
  Malformed: {
    readonly seq: number;
    readonly from: number;
    readonly size: number;
  };
}>;

export const WelcomeFits = Data.taggedEnum<WelcomeFit>();

const startOf = ({ missedFrom, skipped }: WelcomeSpan) =>
  Option.match(skipped, {
    onNone: () => missedFrom,
    onSome: ({ from }) => from,
  });

const isConsistent = ({ missedCount, missedFrom, seq, skipped }: WelcomeSpan) =>
  missedFrom + missedCount - 1 === seq &&
  Option.match(skipped, {
    onNone: () => true,
    onSome: ({ from, to }) => from <= to && to + 1 === missedFrom,
  });

export const fitWelcome = (
  applied: Option.Option<number>,
  span: WelcomeSpan
): WelcomeFit => {
  const start = startOf(span);

  if (!isConsistent(span)) {
    return WelcomeFits.Malformed({
      from: start,
      seq: span.seq,
      size: span.missedCount,
    });
  }

  return Option.match(applied, {
    onNone: () => WelcomeFits.Resume({ keepFrom: 0, skipped: span.skipped }),
    onSome: (last) =>
      start > last + 1
        ? WelcomeFits.Gap({ expected: last + 1, from: start })
        : WelcomeFits.Resume({
            keepFrom: Math.min(
              span.missedCount,
              Math.max(0, last + 1 - span.missedFrom)
            ),
            skipped: span.skipped.pipe(
              Option.filter(({ to }) => to > last),
              Option.map(({ from, to }) => ({
                from: Math.max(from, last + 1),
                to,
              }))
            ),
          }),
  });
};
