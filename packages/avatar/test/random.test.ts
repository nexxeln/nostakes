import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  AvatarSchema,
  COLOURS,
  EXTRAS,
  EYES,
  EYEWEAR,
  HEADWEAR,
  MARKS,
  MOUTHS,
  NECKWEAR,
  RANKS,
  randomAvatar,
  seedFrom,
  SPECIES,
  SUITS,
} from "../src/index.js";
import type { Avatar } from "../src/index.js";

const seeds = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2 ** 32 - 1, minimum: 0 }))
);

const wornParts = (avatar: Avatar) =>
  [
    avatar.headwear,
    avatar.eyewear,
    avatar.neck,
    avatar.mark,
    avatar.extra,
  ].filter((part) => part !== "None").length;

const rolled = Array.from({ length: 1000 }, (_, seed) => randomAvatar(seed));

const seen = (pick: (avatar: Avatar) => string) => new Set(rolled.map(pick));

const share = (among: readonly Avatar[], wanted: (avatar: Avatar) => boolean) =>
  among.filter(wanted).length / among.length;

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
    "never dresses a face in more than three things",
    { seed: seeds },
    ({ seed }) => {
      expect(wornParts(randomAvatar(seed))).toBeLessThanOrEqual(3);
    }
  );

  it("reaches every choice of every part within a thousand shuffles", () => {
    expect(seen((avatar) => avatar.species)).toStrictEqual(new Set(SPECIES));
    expect(seen((avatar) => avatar.colour)).toStrictEqual(new Set(COLOURS));
    expect(seen((avatar) => avatar.suit)).toStrictEqual(new Set(SUITS));
    expect(seen((avatar) => avatar.rank)).toStrictEqual(new Set(RANKS));
    expect(seen((avatar) => avatar.eyes)).toStrictEqual(new Set(EYES));
    expect(seen((avatar) => avatar.mouth)).toStrictEqual(new Set(MOUTHS));
    expect(seen((avatar) => avatar.headwear)).toStrictEqual(new Set(HEADWEAR));
    expect(seen((avatar) => avatar.eyewear)).toStrictEqual(new Set(EYEWEAR));
    expect(seen((avatar) => avatar.neck)).toStrictEqual(new Set(NECKWEAR));
    expect(seen((avatar) => avatar.mark)).toStrictEqual(new Set(MARKS));
    expect(seen((avatar) => avatar.extra)).toStrictEqual(new Set(EXTRAS));
  });

  it("mostly gives a species its own colours and its own card", () => {
    const goldfish = rolled.filter((avatar) => avatar.species === "Goldfish");
    const sharks = rolled.filter((avatar) => avatar.species === "GreatWhite");

    expect(
      share(goldfish, (fish) => fish.colour === "YellowRed")
    ).toBeGreaterThan(0.33);
    expect(share(goldfish, (fish) => fish.rank === "Two")).toBeGreaterThan(0.5);
    expect(share(sharks, (shark) => shark.rank === "King")).toBeGreaterThan(
      0.5
    );
    expect(share(sharks, (shark) => shark.mouth === "Pucker")).toBe(0);
  });

  it("does not repeat itself across consecutive shuffles", () => {
    const faces = new Set(
      Array.from({ length: 200 }, (_, seed) =>
        JSON.stringify(randomAvatar(seedFrom(`player-${seed}`)))
      )
    );

    expect(faces.size).toBe(200);
  });
});
