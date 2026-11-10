import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  ACCENTS,
  ACCESSORIES,
  AvatarSchema,
  BACKDROPS,
  CHEEKS,
  EYES,
  FURS,
  MARKINGS,
  MOUTHS,
  randomAvatar,
  seedFrom,
  SPECIES,
} from "../src/index.js";

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

  it("reaches every choice of every part within a thousand shuffles", () => {
    const rolled = Array.from({ length: 1000 }, (_, seed) =>
      randomAvatar(seed)
    );

    const seen = (pick: (avatar: (typeof rolled)[number]) => string) =>
      new Set(rolled.map(pick));

    expect(seen((avatar) => avatar.species)).toStrictEqual(new Set(SPECIES));
    expect(seen((avatar) => avatar.fur)).toStrictEqual(new Set(FURS));
    expect(seen((avatar) => avatar.marking)).toStrictEqual(new Set(MARKINGS));
    expect(seen((avatar) => avatar.eyes)).toStrictEqual(new Set(EYES));
    expect(seen((avatar) => avatar.mouth)).toStrictEqual(new Set(MOUTHS));
    expect(seen((avatar) => avatar.cheeks)).toStrictEqual(new Set(CHEEKS));
    expect(seen((avatar) => avatar.accessory)).toStrictEqual(
      new Set(ACCESSORIES)
    );
    expect(seen((avatar) => avatar.accent)).toStrictEqual(new Set(ACCENTS));
    expect(seen((avatar) => avatar.backdrop)).toStrictEqual(new Set(BACKDROPS));
  });

  it("does not repeat itself across consecutive shuffles", () => {
    const rolled = new Set(
      Array.from({ length: 200 }, (_, seed) =>
        JSON.stringify(randomAvatar(seedFrom(`player-${seed}`)))
      )
    );

    expect(rolled.size).toBe(200);
  });
});
