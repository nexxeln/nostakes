import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { halfRoundedDown } from "../src/features/table/sizing.js";

describe("raise sizing", () => {
  it.prop(
    "halves a pot rounding down, leaving at most one chip over",
    {
      amount: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ maximum: 10_000_000, minimum: 0 }))
      ),
    },
    ({ amount }) => {
      const half = halfRoundedDown(amount);
      const left = amount - half - half;

      expect(left === 0 || left === 1).toBe(true);
    }
  );
});
