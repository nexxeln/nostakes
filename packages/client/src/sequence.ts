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

export interface WelcomeFit {
  readonly firstMissed: number;
  readonly keepFrom: number;
  readonly skipped: Option.Option<{
    readonly from: number;
    readonly to: number;
  }>;
}

export const fitWelcome = (
  applied: Option.Option<number>,
  seq: number,
  missed: number
): WelcomeFit => {
  const firstMissed = seq - missed + 1;

  return Option.match(applied, {
    onNone: () => ({ firstMissed, keepFrom: 0, skipped: Option.none() }),
    onSome: (last) => ({
      firstMissed,
      keepFrom: Math.min(missed, Math.max(0, last + 1 - firstMissed)),
      skipped:
        firstMissed - 1 > last
          ? Option.some({ from: last + 1, to: firstMissed - 1 })
          : Option.none(),
    }),
  });
};
