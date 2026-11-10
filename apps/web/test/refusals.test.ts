import { describe, expect, it } from "@effect/vitest";
import { HttpRefusalSchema } from "@nostakes/protocol";
import * as Arbitrary from "effect/Arbitrary";

import { refusalText } from "../src/features/refusals.js";

describe("a refused create or join", () => {
  it("says how long to wait when the server is turning this network away", () => {
    expect(
      refusalText({ refusal: "TooManyRequests", retryAfterSeconds: 60 })
    ).toBe("Too many tries from this network. Try again in 1 minute.");
    expect(
      refusalText({ refusal: "TooManyRequests", retryAfterSeconds: 45 })
    ).toBe("Too many tries from this network. Try again in 45 seconds.");
    expect(
      refusalText({ refusal: "TooManyRequests", retryAfterSeconds: 1 })
    ).toBe("Too many tries from this network. Try again in 1 second.");
  });

  it.prop(
    "has a plain sentence for every refusal the server can send",
    { refusal: Arbitrary.schema(HttpRefusalSchema) },
    ({ refusal }) => {
      const text = refusalText(refusal);

      expect(text).toMatch(/^[A-Z].*\.$/u);
      expect(text).not.toContain(refusal.refusal);
      expect(text.replace(/ in \d+ (?:second|minute)s?\.$/u, ".")).not.toMatch(
        /\d{3}/u
      );
    },
    { arbitrary: { runs: 100 } }
  );
});
