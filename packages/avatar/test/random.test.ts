import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { AvatarSchema, randomAvatar } from "../src/index.js";

const seeds = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2 ** 32 - 1, minimum: 0 }))
);

describe("randomAvatar", () => {
  it.prop(
    "makes a valid avatar, the same one for the same seed",
    { seed: seeds },
    ({ seed }) => {
      const avatar = randomAvatar(seed);

      expect(Schema.is(AvatarSchema)(avatar)).toBe(true);
      expect(randomAvatar(seed)).toStrictEqual(avatar);
    }
  );
});
