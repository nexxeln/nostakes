import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { reachFor } from "../src/features/moments/clip-reach.js";

describe("how much of a moment a device is asked to film", () => {
  it("films the replay where the browser says nothing about memory, the short clip on 2 GB, and nothing below", () => {
    expect(
      [Option.none(), ...[0.5, 1, 2, 3, 4, 8, 16].map(Option.some)].map(
        reachFor
      )
    ).toStrictEqual([
      "Replay",
      "None",
      "None",
      "Short",
      "Short",
      "Replay",
      "Replay",
      "Replay",
    ]);
  });
});
