import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { RoomCodeSchema } from "../src/index.js";

describe("a room code", () => {
  it("is the protocol's six-character code, so a code the room accepts is one the server can mint and route", () => {
    const valid = Schema.is(RoomCodeSchema);

    expect(["K7P2XZ", "234567", "ZZZZZZ"].map(valid)).toStrictEqual([
      true,
      true,
      true,
    ]);
    expect(
      ["night", "K7P2X", "K7P2XZ9", "K7P2XO", "k7p2xz"].map(valid)
    ).toStrictEqual([false, false, false, false, false]);
  });
});
