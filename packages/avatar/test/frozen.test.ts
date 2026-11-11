import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  CHOICES,
  EXPRESSIONS,
  PARTS,
  randomAvatar,
  render,
  SPECIES,
} from "../src/index.js";
import type { Avatar, RenderOptions, Species } from "../src/index.js";

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

const WORN_PARTS = PARTS.filter((part) => part !== "species");

const everyChoice = SPECIES.flatMap((species) =>
  WORN_PARTS.flatMap((part) =>
    CHOICES[part].map((choice): Avatar => ({
      ...plainFace(species),
      [part]: choice,
    }))
  )
);

const dealt = Array.from({ length: 60 }, (_, index) =>
  randomAvatar(index * 7919 + 13)
);

const OTHER_LOOKS: readonly Omit<RenderOptions, "expression">[] = [
  { size: 40 },
  { size: 96, theme: "Dark" },
  { layers: true, size: 168 },
];

const drawingsOf = (face: Avatar) => [
  ...EXPRESSIONS.map((expression) => render(face, { expression, size: 96 })),
  ...OTHER_LOOKS.map((look) =>
    render(face, { expression: "Resting", ...look })
  ),
];

const digestOf = (text: string) =>
  Effect.promise(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  ).pipe(
    Effect.map((bytes) =>
      [...new Uint8Array(bytes)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
    )
  );

const APPROVED =
  "1070cac3556ef6fe25dcbb8245746be7ac627f1c4a309c6f2113a188fa1e5c28";

describe("the approved art", () => {
  it.effect(
    "is drawn exactly as it was when it was approved, sheet for sheet",
    () =>
      Effect.gen(function* drawEveryFace() {
        const cast = [...everyChoice, ...dealt];

        const digests = yield* Effect.all(
          cast.map((face) => digestOf(drawingsOf(face).join("\n")))
        );

        expect(cast).toHaveLength(500);
        expect(yield* digestOf(digests.join("\n"))).toBe(APPROVED);
      })
  );
});
