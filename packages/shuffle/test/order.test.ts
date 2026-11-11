import { describe, expect, it } from "@effect/vitest";
import { Array as Arr } from "effect";

import {
  dealingPlan,
  SeedSchema,
  sha256,
  shuffledIndices,
} from "../src/index.js";
import type { Draw } from "../src/index.js";

interface Scripted {
  readonly draw: Draw;
  readonly asked: readonly number[];
}

const scripted = (draws: readonly number[]): Scripted => {
  const asked: number[] = [];

  return {
    asked,
    draw: (choices) => {
      const draw = draws[asked.length] ?? 0;

      asked.push(choices);

      return draw;
    },
  };
};

const everyDrawSequence = (size: number): readonly (readonly number[])[] => {
  let sequences: readonly (readonly number[])[] = [[]];

  for (let choices = size; choices >= 2; choices -= 1) {
    sequences = sequences.flatMap((sequence) =>
      Arr.range(0, choices - 1).map((draw) => [...sequence, draw])
    );
  }

  return sequences;
};

const seedNumber = (index: number) => {
  const bytes = new Uint8Array(4);

  new DataView(bytes.buffer).setUint32(0, index);

  return SeedSchema.make(sha256(bytes));
};

const SAMPLES = 20_000;

const plans = Arr.range(0, SAMPLES - 1).map((index) =>
  dealingPlan(seedNumber(index))
);

const chiSquare = (counts: readonly number[], expected: number) =>
  counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);

const ONE_IN_A_MILLION_Z = 4.7534;

const criticalChiSquare = (freedom: number) => {
  const spread = 2 / (9 * freedom);

  return freedom * (1 - spread + ONE_IN_A_MILLION_Z * Math.sqrt(spread)) ** 3;
};

const positionCounts = (dealIndex: number) => {
  const counts = Array.from({ length: 52 }, () => 0);

  for (const { order } of plans) {
    const position = order[dealIndex] ?? 0;

    counts[position] = (counts[position] ?? 0) + 1;
  }

  return counts;
};

describe("the shuffle step", () => {
  it.each([3, 4, 5, 6])(
    "asks for n, n-1, ..., 2 choices and maps those draws for %i cards one to one onto every ordering",
    (size) => {
      const sequences = everyDrawSequence(size);

      const runs = sequences.map((draws) => {
        const script = scripted(draws);

        return {
          asked: script.asked,
          ordering: shuffledIndices(size, script.draw).join(","),
        };
      });

      const orderings = new Set(runs.map(({ ordering }) => ordering));

      const factorial = Arr.range(1, size).reduce(
        (product, factor) => product * factor,
        1
      );

      expect([sequences.length, orderings.size]).toEqual([
        factorial,
        factorial,
      ]);

      expect(new Set(runs.map(({ asked }) => asked.join(",")))).toEqual(
        new Set([Arr.range(2, size).toReversed().join(",")])
      );
    }
  );
});

describe("the dealing order over 20,000 fixed seeds", () => {
  it.each([0, 1, 8, 26, 51])(
    "sends deal %i to every sealed position about equally often, so a stacked deck gains nothing",
    (dealIndex) => {
      expect(chiSquare(positionCounts(dealIndex), SAMPLES / 52)).toBeLessThan(
        criticalChiSquare(51)
      );
    }
  );

  it("is a full ordering of the 52 sealed positions every time", () => {
    expect(
      plans.every(
        ({ order }) => new Set(order).size === 52 && order.length === 52
      )
    ).toBe(true);
  });
});
