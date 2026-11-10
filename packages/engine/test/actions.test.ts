import { describe, expect, it } from "@effect/vitest";
import { Option, Schema } from "effect";

import { RaiseRangeSchema } from "../src/index.js";

describe("a raise range", () => {
  it("never puts its smallest raise above its largest, and gives a seat that can only go all in short of a full raise a single amount", () => {
    const decode = Schema.decodeUnknownOption(RaiseRangeSchema);

    expect(decode({ maxTo: 40, minTo: 50 })).toStrictEqual(Option.none());
    expect(decode({ maxTo: 40, minTo: 40 })).toStrictEqual(
      Option.some({ maxTo: 40, minTo: 40 })
    );
  });
});
