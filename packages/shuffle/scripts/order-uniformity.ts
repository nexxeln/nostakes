import { dealingPlan, SeedSchema, sha256 } from "@nostakes/shuffle";
import { Console, Effect, Schema } from "effect";

const samples = 400_000;

const positions = 52;

const ONE_IN_A_MILLION_Z = 4.7534;

class OrderLooksBiased extends Schema.TaggedError<
  OrderLooksBiased,
  { readonly brand: unique symbol }
>()("OrderLooksBiased", {
  critical: Schema.Finite,
  statistic: Schema.Finite,
  test: Schema.String,
}) {
  override get message() {
    return `${this.test}: chi-square ${this.statistic.toFixed(1)} is over the one-in-a-million bound ${this.critical.toFixed(1)}. Check the draw and the Fisher-Yates loop in src/order.ts.`;
  }
}

const seedNumber = (index: number) => {
  const bytes = new Uint8Array(4);

  new DataView(bytes.buffer).setUint32(0, index);

  return SeedSchema.make(sha256(bytes));
};

const chiSquare = (counts: readonly number[], expected: number) =>
  counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);

const criticalChiSquare = (freedom: number) => {
  const spread = 2 / (9 * freedom);

  return freedom * (1 - spread + ONE_IN_A_MILLION_Z * Math.sqrt(spread)) ** 3;
};

const tally = () => {
  const byDealIndex = Array.from({ length: positions }, () =>
    Array.from({ length: positions }, () => 0)
  );

  const firstTwo = Array.from({ length: positions * positions }, () => 0);
  let slotZero = 0;

  for (let index = 0; index < samples; index += 1) {
    const { dealtSlot, order } = dealingPlan(seedNumber(index));

    slotZero += dealtSlot === 0 ? 1 : 0;

    for (const [dealIndex, position] of order.entries()) {
      const row = byDealIndex[dealIndex];

      if (row !== undefined) {
        row[position] = (row[position] ?? 0) + 1;
      }
    }

    const pair = (order[0] ?? 0) * positions + (order[1] ?? 0);

    firstTwo[pair] = (firstTwo[pair] ?? 0) + 1;
  }

  return { byDealIndex, firstTwo, slotZero };
};

const program = Effect.gen(function* program() {
  const { byDealIndex, firstTwo, slotZero } = tally();
  const slotZ = Math.abs(slotZero - samples / 2) / Math.sqrt(samples / 4);

  if (slotZ >= ONE_IN_A_MILLION_Z) {
    return yield* new OrderLooksBiased({
      critical: ONE_IN_A_MILLION_Z,
      statistic: slotZ,
      test: "dealt slot",
    });
  }

  const marginalBound = criticalChiSquare(positions - 1);
  let worstMarginal = 0;

  for (const [dealIndex, counts] of byDealIndex.entries()) {
    const statistic = chiSquare(counts, samples / positions);

    worstMarginal = Math.max(worstMarginal, statistic);

    if (statistic >= marginalBound) {
      return yield* new OrderLooksBiased({
        critical: marginalBound,
        statistic,
        test: `position of deal ${dealIndex}`,
      });
    }
  }

  const pairCells = firstTwo.filter(
    (_, cell) => Math.floor(cell / positions) !== cell % positions
  );

  const pairBound = criticalChiSquare(pairCells.length - 1);
  const pairStatistic = chiSquare(pairCells, samples / pairCells.length);

  if (pairStatistic >= pairBound) {
    return yield* new OrderLooksBiased({
      critical: pairBound,
      statistic: pairStatistic,
      test: "positions of deals 0 and 1 together",
    });
  }

  return yield* Console.log(
    `dealing order over ${samples} seeds: slot z ${slotZ.toFixed(2)}; worst single-deal chi-square ${worstMarginal.toFixed(1)} under ${marginalBound.toFixed(1)} (df 51, 52 deals); first-two-deals chi-square ${pairStatistic.toFixed(1)} under ${pairBound.toFixed(1)} (df ${pairCells.length - 1})`
  );
});

await Effect.runPromise(program);
