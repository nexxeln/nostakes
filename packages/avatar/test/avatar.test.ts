import { describe, expect, it } from "@effect/vitest";
import { AvatarSchema as RoomAvatarSchema } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  AvatarSchema,
  avatarFor,
  codeFor,
  COLOURS,
  DEFAULT_AVATAR,
  EXPRESSIONS,
  EXTRAS,
  EYES,
  EYEWEAR,
  HEADWEAR,
  MARKS,
  MOUTHS,
  NECKWEAR,
  parseAvatar,
  RANKS,
  render,
  SPECIES,
  SUITS,
} from "../src/index.js";
import type { Avatar } from "../src/index.js";
import { repeatedAttributes, unclosedTags } from "./svg.js";

const avatars = Arbitrary.schema(AvatarSchema);

const notCodes = Arbitrary.schema(Schema.String).pipe(
  Arbitrary.filter((text) => !text.startsWith("h1") && !text.startsWith("s1"))
);

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

const PARTS: readonly (readonly [keyof Avatar, readonly string[]])[] = [
  ["species", SPECIES],
  ["colour", COLOURS],
  ["suit", SUITS],
  ["rank", RANKS],
  ["eyes", EYES],
  ["mouth", MOUTHS],
  ["headwear", HEADWEAR],
  ["eyewear", EYEWEAR],
  ["neck", NECKWEAR],
  ["mark", MARKS],
  ["extra", EXTRAS],
];

const SHADOW =
  /<path d="[^"]+" fill="rgba\([^"]+\)" transform="translate\((?<dx>[\d.]+) (?<dy>[\d.]+)\)"/gu;

const waitingAndPeeking = (worn: Avatar) =>
  render(worn, { expression: "Resting", size: 96 }) +
  render(worn, { expression: "LookingDown", size: 96 });

const shadowDepths = (svg: string) =>
  [...svg.matchAll(SHADOW)].map((match) => Number(match.groups?.dy ?? "0"));

describe("avatar codes", () => {
  it.prop(
    "every avatar fits the room's avatar string and decodes to itself",
    { avatar: avatars },
    ({ avatar }) => {
      const code = codeFor(avatar);

      expect(Schema.is(RoomAvatarSchema)(code)).toBe(true);
      expect(code).toMatch(/^h1[0-9a-z]{11}$/u);
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
          expect(svg).not.toMatch(/undefined|NaN|Infinity|\[object/u);
          expect(render(avatar, { expression, size })).toBe(svg);
        }
      }
    }
  );

  it.prop(
    "shares nothing by id and never blurs or blends, so nine faces stay cheap on one page",
    { avatar: avatars },
    ({ avatar }) => {
      for (const expression of EXPRESSIONS) {
        const svg = render(avatar, { expression, size: 66, theme: "Dark" });

        expect(svg).not.toMatch(/\sid=|url\(#|filter|blend|<style|<use/u);
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

  it.prop(
    "draws every choice of every part, waiting or looking at its cards",
    { avatar: avatars },
    ({ avatar }) => {
      const seen = waitingAndPeeking(avatar);

      for (const [part, choices] of PARTS) {
        for (const choice of choices) {
          if (choice !== avatar[part]) {
            expect(waitingAndPeeking({ ...avatar, [part]: choice })).not.toBe(
              seen
            );
          }
        }
      }
    },
    { arbitrary: { runs: 40 } }
  );

  it.prop(
    "lifts its sheets with shadows at least 1.4 screen pixels deep, and 1.5 at the smallest sizes",
    { avatar: avatars },
    ({ avatar }) => {
      for (const [size, floor] of [
        [40, 1.5],
        [52, 1.5],
        [66, 1.4],
        [170, 1.4],
      ] as const) {
        const depths = shadowDepths(
          render(avatar, { expression: "Resting", size })
        );

        expect(depths.length).toBeGreaterThan(3);
        expect(Math.min(...depths) * (size / 100)).toBeGreaterThanOrEqual(
          floor * 0.99
        );
      }
    }
  );

  it.prop(
    "draws the same sheets on a dark ground, cut out with the dark ground's colours",
    { avatar: avatars },
    ({ avatar }) => {
      const light = render(avatar, { expression: "Resting", size: 66 });

      const dark = render(avatar, {
        expression: "Resting",
        size: 66,
        theme: "Dark",
      });

      expect(
        render(avatar, { expression: "Resting", size: 66, theme: "Light" })
      ).toBe(light);
      expect(dark).not.toBe(light);
      expect(shadowDepths(dark)).toStrictEqual(shadowDepths(light));
      expect(dark).toContain('stroke="#16141d"');
      expect(light).toContain('stroke="#f6f1e8"');
    }
  );

  it.prop(
    "marks each sheet for the builder without changing the drawing",
    { avatar: avatars },
    ({ avatar }) => {
      for (const expression of EXPRESSIONS) {
        const plain = render(avatar, { expression, size: 168 });
        const marked = render(avatar, { expression, layers: true, size: 168 });

        const sheets = [
          ...marked.matchAll(/<g class="sheet" style="--sheet:(?<n>\d+)">/gu),
        ];

        expect(sheets.map((match) => Number(match.groups?.n))).toStrictEqual(
          sheets.map((_, index) => index)
        );
        expect(sheets.length).toBeGreaterThan(3);
        expect(plain).not.toContain('class="sheet"');
        expect(
          marked
            .replaceAll(/<g class="sheet" style="--sheet:\d+">/gu, "<g>")
            .replaceAll(/<g>|<\/g>/gu, "")
        ).toBe(plain.replaceAll(/<g>|<\/g>/gu, ""));
      }
    }
  );

  it("sizes the svg to the frame it sits in and lets the card rise out of it", () => {
    const svg = render(DEFAULT_AVATAR, { expression: "Resting", size: 40 });

    expect(svg).toContain('width="40" height="40"');
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).toContain('overflow="visible"');
  });

  it("draws an old string the same way on every device", () => {
    expect(render(avatarFor("🐼"), { expression: "Happy", size: 80 })).toBe(
      render(avatarFor("🐼"), { expression: "Happy", size: 80 })
    );
  });
});
