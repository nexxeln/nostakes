import { describe, expect, it } from "@effect/vitest";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  AvatarSchema,
  avatarFor,
  codeFor,
  DEFAULT_AVATAR,
  parseAvatar,
} from "../src/index.js";

const avatars = Arbitrary.schema(AvatarSchema);

const OLD_SPECIES = [
  "GreatWhite",
  "Hammerhead",
  "GreatWhite",
  "Goldfish",
  "Puffer",
  "Piranha",
  "Goldfish",
  "Angler",
  "Whale",
  "Octopus",
] as const;

const sharksCodes = Arbitrary.schema(
  Schema.Tuple([
    Schema.Int.check(Schema.isBetween({ maximum: 9, minimum: 0 })),
    Schema.String.check(
      Schema.isPattern(/^[0-9ab][0-4][0-5][0-8][0-8][0-6][0-9][0-6][0-9]$/u)
    ),
  ])
);

describe("avatar codes", () => {
  it.prop(
    "every avatar encodes to a 13-character code and decodes to itself",
    { avatar: avatars },
    ({ avatar }) => {
      const code = codeFor(avatar);

      expect(code).toMatch(/^h1[0-9a-z]{11}$/u);
      expect(parseAvatar(code)).toStrictEqual(Option.some({ ...avatar }));
    }
  );

  it.prop(
    "a face built with the shark art keeps its species, the same way every time",
    { code: sharksCodes },
    ({ code: [species, rest] }) => {
      const code = `s1${species}${rest}`;
      const face = avatarFor(code);

      expect(face.species).toBe(OLD_SPECIES[species]);
      expect(avatarFor(code)).toStrictEqual(face);
    }
  );

  it("gives old codes, emoji, and garbage a face from the new cast", () => {
    const leftovers = [
      "c14b0320715",
      "c10000000000",
      "c1zzzzzzzzz",
      "s18225233724",
      "s10010011100",
      "🦊",
      "",
      " h10000000000",
      "h1z0000000000",
    ];

    for (const leftover of leftovers) {
      expect(parseAvatar(leftover)).toStrictEqual(Option.none());
      expect(Schema.is(AvatarSchema)(avatarFor(leftover))).toBe(true);
    }

    expect(
      new Set(leftovers.map((leftover) => codeFor(avatarFor(leftover)))).size
    ).toBeGreaterThan(6);
    expect(avatarFor("s18225233724")).toMatchObject({
      eyewear: "Shades",
      headwear: "Fedora",
      mark: "Index",
      mouth: "GoldTooth",
      neck: "Bolo",
      species: "Whale",
    });
  });

  it("decodes a known code to its parts", () => {
    expect(parseAvatar("h151311552351")).toStrictEqual(
      Option.some({
        colour: "BluePink",
        extra: "Toothpick",
        eyes: "Beads",
        eyewear: "Round",
        headwear: "Bandana",
        mark: "Teardrop",
        mouth: "Pucker",
        neck: "Bolo",
        rank: "King",
        species: "Angler",
        suit: "Club",
      })
    );
    expect(codeFor(DEFAULT_AVATAR)).toBe("h100010001100");
  });
});
