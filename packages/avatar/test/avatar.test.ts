import { describe, expect, it } from "@effect/vitest";
import { AvatarSchema as RoomAvatarSchema } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  AvatarSchema,
  avatarFor,
  codeFor,
  DEFAULT_AVATAR,
  EXPRESSIONS,
  parseAvatar,
  render,
} from "../src/index.js";
import { repeatedAttributes, unclosedTags } from "./svg.js";

const avatars = Arbitrary.schema(AvatarSchema);

const notCodes = Arbitrary.schema(Schema.String).pipe(
  Arbitrary.filter((text) => !text.startsWith("s1"))
);

describe("avatar codes", () => {
  it.prop(
    "every avatar fits the room's avatar string and decodes to itself",
    { avatar: avatars },
    ({ avatar }) => {
      const code = codeFor(avatar);

      expect(Schema.is(RoomAvatarSchema)(code)).toBe(true);
      expect(code).toMatch(/^s1[0-9a-z]{10}$/u);
      expect(parseAvatar(code)).toStrictEqual(Option.some({ ...avatar }));
    }
  );

  it.prop(
    "a string that is not a code always gets the same face from the cast",
    { text: notCodes },
    ({ text }) => {
      const face = avatarFor(text);

      expect(Schema.is(AvatarSchema)(face)).toBe(true);
      expect(avatarFor(text)).toStrictEqual(face);
    }
  );

  it("gives old Critters codes, emoji, and garbage a face from the new cast", () => {
    const leftovers = [
      "c14b0320715",
      "c10000000000",
      "c1zzzzzzzzz",
      "🦊",
      "",
      " s10010011100",
      "s1a000000000",
    ];

    for (const leftover of leftovers) {
      expect(parseAvatar(leftover)).toStrictEqual(Option.none());
      expect(Schema.is(AvatarSchema)(avatarFor(leftover))).toBe(true);
    }

    expect(
      new Set(leftovers.map((leftover) => codeFor(avatarFor(leftover)))).size
    ).toBeGreaterThan(4);
  });

  it("decodes a known code to its parts", () => {
    expect(parseAvatar("s18225233724")).toStrictEqual(
      Option.some({
        backdrop: "Velvet",
        body: "Midnight",
        extra: "Cigar",
        eyes: "Sharp",
        eyewear: "Wraps",
        headwear: "Fedora",
        mouth: "GoldTooth",
        neck: "Bolo",
        species: "Whale",
        tattoo: "AllIn",
      })
    );
    expect(codeFor(DEFAULT_AVATAR)).toBe("s10010011100");
  });
});

describe("render", () => {
  it.prop(
    "draws every avatar in every expression as one well-formed svg, the same way twice",
    { avatar: avatars },
    ({ avatar }) => {
      for (const expression of EXPRESSIONS) {
        for (const size of [40, 96]) {
          const svg = render(avatar, { expression, size });

          expect(svg.startsWith("<svg ")).toBe(true);
          expect(unclosedTags(svg)).toStrictEqual([]);
          expect(repeatedAttributes(svg)).toStrictEqual([]);
          expect(svg).not.toMatch(/undefined|NaN|\[object/u);
          expect(render(avatar, { expression, size })).toBe(svg);
        }
      }
    }
  );

  it.prop(
    "gives every expression its own face",
    { avatar: avatars },
    ({ avatar }) => {
      const faces = EXPRESSIONS.map((expression) =>
        render(avatar, { expression, size: 96 })
      );

      expect(new Set(faces).size).toBe(EXPRESSIONS.length);
    }
  );

  it("sizes the svg to the frame it sits in", () => {
    const svg = render(DEFAULT_AVATAR, { expression: "Resting", size: 40 });

    expect(svg).toContain('width="40" height="40"');
    expect(svg).toContain('viewBox="0 0 100 100"');
  });

  it("draws an old string the same way on every device", () => {
    expect(render(avatarFor("🐼"), { expression: "Happy", size: 80 })).toBe(
      render(avatarFor("🐼"), { expression: "Happy", size: 80 })
    );
  });
});
