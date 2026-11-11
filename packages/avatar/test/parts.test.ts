import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  AvatarSchema,
  boxOfPart,
  CHOICES,
  closeUpOf,
  coversOfPart,
  EXPRESSIONS,
  isPlaced,
  PARTS,
  PLACED_PARTS,
  PLACELESS_PARTS,
  reachOfPart,
  render,
  SPECIES,
} from "../src/index.js";
import type { Avatar, Box, PlacedPart, Species } from "../src/index.js";

const avatars = Arbitrary.schema(AvatarSchema);

const plainFace = (species: Species): Avatar => ({
  colour: "BlueYellow",
  extra: "None",
  eyes: "Pips",
  eyewear: "None",
  headwear: "None",
  mark: "None",
  mouth: "Line",
  neck: "None",
  rank: "Ace",
  species,
  suit: "Spade",
});

const tagOf = (part: string) => `data-part="${part}"`;

const TAG = /<g data-part="[a-z]+"[^>]*>/gu;

const untagged = (svg: string) =>
  svg.replaceAll(TAG, "<g>").replaceAll(/<g>|<\/g>/gu, "");

const SHADOW_DROP =
  /fill="rgba\([^"]+\)" transform="translate\([\d.-]+ (?<dy>[\d.]+)\)"/gu;

const GROUP_EDGE = /<g[\s>]|<\/g>/gu;

const groupFrom = (svg: string, from: number) => {
  let depth = 0;

  for (const edge of svg.slice(from).matchAll(GROUP_EDGE)) {
    depth += edge[0] === "</g>" ? -1 : 1;

    if (depth === 0) {
      return svg.slice(from, from + edge.index + edge[0].length);
    }
  }

  return svg.slice(from);
};

const groupOf = (svg: string, part: PlacedPart) =>
  [...svg.matchAll(new RegExp(`<g ${tagOf(part)}`, "gu"))]
    .map((match) => groupFrom(svg, match.index))
    .join("");

const dropsIn = (svg: string) =>
  [...svg.matchAll(SHADOW_DROP)].map((match) => Number(match.groups?.dy));

const SHIFT = /data-shift="(?<dx>[\d.-]+) (?<dy>[\d.-]+)" opacity/u;

const overlap = (one: Box, other: Box) =>
  Math.max(
    0,
    Math.min(one.x + one.width, other.x + other.width) -
      Math.max(one.x, other.x)
  ) *
  Math.max(
    0,
    Math.min(one.y + one.height, other.y + other.height) -
      Math.max(one.y, other.y)
  );

const holds = (outer: Box, inner: Box) =>
  inner.x >= outer.x - 0.01 &&
  inner.y >= outer.y - 0.01 &&
  inner.x + inner.width <= outer.x + outer.width + 0.01 &&
  inner.y + inner.height <= outer.y + outer.height + 0.01;

const FURTHEST_ASIDE = 30;

describe("the parts of a face", () => {
  it("are eight with a place on the face and three without", () => {
    expect([...PLACED_PARTS, ...PLACELESS_PARTS].toSorted()).toStrictEqual(
      [...PARTS].toSorted()
    );
    expect(PLACELESS_PARTS).toStrictEqual(["species", "colour", "suit"]);
    expect(PARTS.filter(isPlaced)).toStrictEqual(
      PARTS.filter((part) => PLACED_PARTS.some((placed) => placed === part))
    );
  });

  it("tags a sheet for every choice of every placed part on every fish, and none for a part with no place", () => {
    for (const species of SPECIES) {
      for (const part of PLACED_PARTS) {
        for (const choice of CHOICES[part]) {
          const face: Avatar = { ...plainFace(species), [part]: choice };

          const svg = render(face, {
            expression: "Resting",
            parts: true,
            size: 168,
          });

          expect(
            svg.includes(tagOf(part)),
            `${species} ${part} ${choice}`
          ).toBe(choice !== "None");
          expect(Option.isSome(boxOfPart(face, part))).toBe(choice !== "None");

          for (const placeless of PLACELESS_PARTS) {
            expect(svg).not.toContain(tagOf(placeless));
          }
        }
      }
    }
  });

  it.prop(
    "tags sheets without changing the drawing, with the sheets marked or not",
    { avatar: avatars },
    ({ avatar }) => {
      for (const expression of EXPRESSIONS) {
        for (const layers of [false, true]) {
          const plain = render(avatar, { expression, layers, size: 168 });

          const tagged = render(avatar, {
            expression,
            layers,
            parts: true,
            size: 168,
          });

          expect(plain).not.toContain("data-part");
          expect(untagged(tagged)).toBe(plain.replaceAll(/<g>|<\/g>/gu, ""));
        }
      }
    },
    { arbitrary: { runs: 30 } }
  );

  it.prop(
    "gives every worn part a box inside the reach of that part on that fish",
    { avatar: avatars },
    ({ avatar }) => {
      for (const part of PLACED_PARTS) {
        const reach = reachOfPart(avatar.species, part);

        expect(reach.width).toBeGreaterThan(0);
        expect(reach.height).toBeGreaterThan(0);

        for (const box of Option.toArray(boxOfPart(avatar, part))) {
          expect(holds(reach, box), `${part} of ${avatar.species}`).toBe(true);
        }
      }
    },
    { arbitrary: { runs: 40 } }
  );

  it.prop(
    "draws a lifted part with deeper shadows and leaves every sheet it does not touch alone",
    { avatar: avatars },
    ({ avatar }) => {
      for (const part of PLACED_PARTS) {
        const look = { expression: "Resting", parts: true, size: 168 } as const;
        const resting = render(avatar, look);
        const lifted = render(avatar, { ...look, lifted: part });
        const covers = coversOfPart(avatar, part);

        if (resting.includes(tagOf(part))) {
          const before = dropsIn(groupOf(resting, part));
          const after = dropsIn(groupOf(lifted, part));

          expect(after).toHaveLength(before.length);

          for (const [index, drop] of after.entries()) {
            expect(drop).toBeGreaterThan(before[index] ?? 0);
          }
        }

        for (const other of PLACED_PARTS) {
          if (other !== part && !covers.includes(other) && part !== "eyes") {
            expect(groupOf(lifted, other)).toBe(groupOf(resting, other));
          }
        }
      }
    },
    { arbitrary: { runs: 30 } }
  );

  it("shows eyes that shades hide once the eyes are lifted, and moves the shades clear of them", () => {
    for (const species of SPECIES) {
      const shaded: Avatar = { ...plainFace(species), eyewear: "Shades" };
      const look = { expression: "Resting", parts: true, size: 168 } as const;

      expect(render(shaded, look)).not.toContain(tagOf("eyes"));
      expect(coversOfPart(shaded, "eyes")).toStrictEqual(["eyewear"]);
      expect(
        coversOfPart({ ...shaded, eyewear: "Round" }, "eyes")
      ).toStrictEqual([]);

      const lifted = render(shaded, { ...look, lifted: "eyes" });

      expect(lifted).toContain(tagOf("eyes"));
      expect(groupOf(lifted, "eyewear")).toMatch(SHIFT);
    }
  });

  it.prop(
    "sets a covering part aside until it is clear of the lifted part, or as far as it may go",
    { avatar: avatars },
    ({ avatar }) => {
      for (const part of PLACED_PARTS) {
        const lifted = render(avatar, {
          expression: "Resting",
          lifted: part,
          parts: true,
          size: 168,
        });

        for (const cover of coversOfPart(avatar, part)) {
          const shift = SHIFT.exec(groupOf(lifted, cover))?.groups;
          const dx = Number(shift?.dx);
          const dy = Number(shift?.dy);

          const boxes = Option.all([
            boxOfPart(avatar, part),
            boxOfPart(avatar, cover),
          ]);

          expect(Option.isSome(boxes)).toBe(true);

          for (const [held, covering] of Option.toArray(boxes)) {
            const moved = {
              ...covering,
              x: covering.x + dx,
              y: covering.y + dy,
            };

            expect(
              overlap(held, moved) === 0 ||
                Math.abs(dx) + Math.abs(dy) >= FURTHEST_ASIDE
            ).toBe(true);
          }
        }
      }
    },
    { arbitrary: { runs: 60 } }
  );

  it.prop(
    "uncovers a part without lifting it, and changes nothing when nothing hides it",
    { avatar: avatars },
    ({ avatar }) => {
      const look = { expression: "Resting", parts: true, size: 168 } as const;
      const resting = render(avatar, look);

      for (const part of PLACED_PARTS) {
        const uncovered = render(avatar, { ...look, uncovered: part });
        const covers = coversOfPart(avatar, part);

        if (resting.includes(tagOf(part))) {
          expect(groupOf(uncovered, part)).toBe(groupOf(resting, part));
        }

        if (covers.length === 0 && resting.includes(tagOf(part))) {
          expect(uncovered).toBe(resting);
        }

        for (const cover of covers) {
          expect(groupOf(uncovered, cover)).toMatch(SHIFT);
        }

        expect(
          render(avatar, { ...look, lifted: part, uncovered: "mouth" })
        ).toBe(render(avatar, { ...look, lifted: part }));
      }
    },
    { arbitrary: { runs: 30 } }
  );

  it.prop(
    "lifts the card when the suit is asked for, since the suit has no sheet of its own",
    { avatar: avatars },
    ({ avatar }) => {
      const look = { expression: "Resting", parts: true, size: 168 } as const;

      expect(render(avatar, { ...look, lifted: "suit" })).toBe(
        render(avatar, { ...look, lifted: "rank" })
      );
      expect(render(avatar, { ...look, lifted: "colour" })).toBe(
        render(avatar, look)
      );
    },
    { arbitrary: { runs: 20 } }
  );

  it.prop(
    "crops to a window without redrawing anything inside it",
    { avatar: avatars },
    ({ avatar }) => {
      for (const part of PARTS) {
        const window = closeUpOf(avatar, part, 1.5);
        const whole = render(avatar, { expression: "Resting", size: 200 });

        const cropped = render(avatar, {
          expression: "Resting",
          size: 200,
          window,
        });

        expect(cropped.slice(cropped.indexOf(">"))).toBe(
          whole.slice(whole.indexOf(">"))
        );
        expect(cropped).toContain('preserveAspectRatio="xMidYMid slice"');
        expect(cropped).not.toMatch(/^<svg[^>]* width=/u);
        expect(window.width / window.height).toBeCloseTo(1.5, 6);
        expect(window.width).toBeLessThanOrEqual(isPlaced(part) ? 104 : 156);
      }
    },
    { arbitrary: { runs: 20 } }
  );

  it.prop(
    "frames a close-up that holds the whole part whenever the part fits in one",
    { avatar: avatars },
    ({ avatar }) => {
      for (const part of PLACED_PARTS) {
        const window = closeUpOf(avatar, part, 1);

        for (const box of Option.toArray(boxOfPart(avatar, part))) {
          if (window.width < 104) {
            expect(holds(window, box), `${part} of ${avatar.species}`).toBe(
              true
            );
          }
        }
      }

      expect(closeUpOf(avatar, "species", 1).width).toBe(104);
      expect(closeUpOf(avatar, "colour", 1.5).height).toBe(104);
      expect(closeUpOf(avatar, "colour", 0.5).width).toBe(104);
      expect(closeUpOf(avatar, "suit", 1)).toStrictEqual(
        closeUpOf(avatar, "rank", 1)
      );
    },
    { arbitrary: { runs: 40 } }
  );
});
