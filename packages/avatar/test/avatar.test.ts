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
import { unclosedTags } from "./svg.js";

const avatars = Arbitrary.schema(AvatarSchema);

const notCodes = Arbitrary.schema(Schema.String).pipe(
  Arbitrary.filter((text) => !text.startsWith("c1"))
);

describe("avatar codes", () => {
  it.prop(
    "every avatar fits the room's avatar string and decodes to itself",
    { avatar: avatars },
    ({ avatar }) => {
      const code = codeFor(avatar);

      expect(Schema.is(RoomAvatarSchema)(code)).toBe(true);
      expect(code).toMatch(/^c1[0-9a-z]{9}$/u);
      expect(parseAvatar(code)).toStrictEqual(Option.some({ ...avatar }));
    }
  );

  it.prop(
    "a string that is not a code renders the default avatar",
    { text: notCodes },
    ({ text }) => {
      expect(avatarFor(text)).toStrictEqual(DEFAULT_AVATAR);
    }
  );

  it("reads an old emoji avatar, garbage, and an out-of-range part as the default", () => {
    expect(avatarFor("🦊")).toStrictEqual(DEFAULT_AVATAR);
    expect(avatarFor("")).toStrictEqual(DEFAULT_AVATAR);
    expect(avatarFor("c1zzzzzzzzz")).toStrictEqual(DEFAULT_AVATAR);
    expect(avatarFor("c17000000000")).toStrictEqual(DEFAULT_AVATAR);
    expect(avatarFor(" c1000000000")).toStrictEqual(DEFAULT_AVATAR);
  });

  it("decodes a known code to its parts", () => {
    expect(parseAvatar("c14b0320715")).toStrictEqual(
      Option.some({
        accent: "Coral",
        accessory: "Crown",
        backdrop: "Rose",
        cheeks: "Rosy",
        eyes: "Button",
        fur: "Sage",
        marking: "Plain",
        mouth: "Toothy",
        species: "Frog",
      })
    );
  });
});

describe("render", () => {
  it.prop(
    "draws every avatar in every expression as one closed svg, the same way twice",
    { avatar: avatars },
    ({ avatar }) => {
      for (const expression of EXPRESSIONS) {
        const svg = render(avatar, { expression, size: 64 });

        expect(svg.startsWith("<svg ")).toBe(true);
        expect(unclosedTags(svg)).toStrictEqual([]);
        expect(svg).not.toMatch(/undefined|NaN|\[object/u);
        expect(render(avatar, { expression, size: 64 })).toBe(svg);
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

  it("renders a bad string exactly as the default avatar", () => {
    expect(render(avatarFor("🐼"), { expression: "Happy", size: 80 })).toBe(
      render(DEFAULT_AVATAR, { expression: "Happy", size: 80 })
    );
  });
});
