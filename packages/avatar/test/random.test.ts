import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  AvatarSchema,
  BACKDROPS,
  BODIES,
  EXTRAS,
  EYES,
  EYEWEAR,
  HEADWEAR,
  MOUTHS,
  NECKWEAR,
  randomAvatar,
  seedFrom,
  SPECIES,
  TATTOOS,
} from "../src/index.js";
import type { Avatar } from "../src/index.js";

const seeds = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2 ** 32 - 1, minimum: 0 }))
);

const DARK_BODIES: ReadonlySet<Avatar["body"]> = new Set(["Midnight", "Slate"]);

const DARK_WATERS: ReadonlySet<Avatar["backdrop"]> = new Set([
  "Deep",
  "Velvet",
  "Felt",
]);

const wornParts = (avatar: Avatar) =>
  [
    avatar.headwear,
    avatar.eyewear,
    avatar.neck,
    avatar.tattoo,
    avatar.extra,
  ].filter((part) => part !== "None").length;

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

  it.prop(
    "never puts a dark body on dark water or dresses a face in everything",
    { seed: seeds },
    ({ seed }) => {
      const avatar = randomAvatar(seed);

      expect(
        DARK_BODIES.has(avatar.body) && DARK_WATERS.has(avatar.backdrop)
      ).toBe(false);
      expect(wornParts(avatar)).toBeLessThanOrEqual(3);
    }
  );

  it("reaches every choice of every part within a thousand shuffles", () => {
    const rolled = Array.from({ length: 1000 }, (_, seed) =>
      randomAvatar(seed)
    );

    const seen = (pick: (avatar: Avatar) => string) =>
      new Set(rolled.map(pick));

    expect(seen((avatar) => avatar.species)).toStrictEqual(new Set(SPECIES));
    expect(seen((avatar) => avatar.body)).toStrictEqual(new Set(BODIES));
    expect(seen((avatar) => avatar.eyes)).toStrictEqual(new Set(EYES));
    expect(seen((avatar) => avatar.mouth)).toStrictEqual(new Set(MOUTHS));
    expect(seen((avatar) => avatar.headwear)).toStrictEqual(new Set(HEADWEAR));
    expect(seen((avatar) => avatar.eyewear)).toStrictEqual(new Set(EYEWEAR));
    expect(seen((avatar) => avatar.neck)).toStrictEqual(new Set(NECKWEAR));
    expect(seen((avatar) => avatar.tattoo)).toStrictEqual(new Set(TATTOOS));
    expect(seen((avatar) => avatar.extra)).toStrictEqual(new Set(EXTRAS));
    expect(seen((avatar) => avatar.backdrop)).toStrictEqual(new Set(BACKDROPS));
  });

  it("mostly gives a species its own colours", () => {
    const rolled = Array.from({ length: 1000 }, (_, seed) =>
      randomAvatar(seed)
    );

    const orangeGoldfish = rolled.filter(
      (avatar) => avatar.species === "Goldfish" && avatar.body === "Orange"
    ).length;

    const goldfish = rolled.filter(
      (avatar) => avatar.species === "Goldfish"
    ).length;

    expect(orangeGoldfish * 3).toBeGreaterThan(goldfish);
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
