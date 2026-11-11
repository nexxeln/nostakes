import {
  boxOfPart,
  choicesOf,
  PLACED_PARTS,
  reachOfPart,
} from "@nostakes/avatar";
import type { Avatar, Box, Part, PlacedPart } from "@nostakes/avatar";
import { Option } from "effect";

export const PART_LABELS: Readonly<Record<Part, string>> = {
  colour: "Colour",
  extra: "Extra",
  eyes: "Eyes",
  eyewear: "Glasses",
  headwear: "Hat",
  mark: "Mark",
  mouth: "Mouth",
  neck: "Neck",
  rank: "Card",
  species: "Fish",
  suit: "Suit",
};

const spaced = (name: string) =>
  name.replaceAll(/(?<=[a-z])(?=[A-Z])/gu, " ").toLowerCase();

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const choiceName = (part: Part, choice: string): string => {
  if (part === "colour") {
    return sentence(spaced(choice).replace(" ", " & "));
  }

  return part === "suit" ? `${choice}s` : sentence(spaced(choice));
};

export const shortName = (part: Part, choice: string): string =>
  part === "colour"
    ? sentence(spaced(choice).replace(/ .*/u, ""))
    : choiceName(part, choice);

export const wearing = (avatar: Avatar, part: Part, choice: string): Avatar =>
  choicesOf(part).includes(choice) ? { ...avatar, [part]: choice } : avatar;

export const stepped = (avatar: Avatar, part: Part, by: number): Avatar => {
  const choices = choicesOf(part);
  const at = choices.indexOf(avatar[part]);
  const count = choices.length;

  return wearing(
    avatar,
    part,
    choices[(((at + by) % count) + count) % count] ?? avatar[part]
  );
};

export const toldOf = (avatar: Avatar, part: Part) =>
  `${PART_LABELS[part]}: ${choiceName(part, avatar[part])}`;

export const placeOn = (avatar: Avatar, part: PlacedPart): Box =>
  boxOfPart(avatar, part).pipe(
    Option.getOrElse(() => reachOfPart(avatar.species, part))
  );

export type Side = "left" | "right";

export type Sides = Readonly<Record<Side, readonly PlacedPart[]>>;

const LEAN: Readonly<Record<PlacedPart, number>> = {
  extra: 6,
  eyes: -6,
  eyewear: 2,
  headwear: -8,
  mark: 4,
  mouth: -4,
  neck: -2,
  rank: 8,
};

const PER_SIDE = PLACED_PARTS.length / 2;

export const sidesOf = (avatar: Avatar): Sides => {
  const reaches = PLACED_PARTS.map((part) => {
    const reach = reachOfPart(avatar.species, part);

    return {
      across: reach.x + reach.width / 2 + LEAN[part],
      down: reach.y + reach.height / 2,
      part,
    };
  });

  const across = reaches.toSorted((one, other) => one.across - other.across);

  const down = (side: typeof reaches) =>
    side
      .toSorted((one, other) => one.down - other.down)
      .map(({ part }) => part);

  return {
    left: down(across.slice(0, PER_SIDE)),
    right: down(across.slice(PER_SIDE)),
  };
};

const NEAR_EDGE = 0.14;

export const calloutPoint = (
  avatar: Avatar,
  part: PlacedPart,
  side: Side
): readonly [number, number] => {
  const box = placeOn(avatar, part);

  return [
    box.x + box.width * (side === "left" ? NEAR_EDGE : 1 - NEAR_EDGE),
    box.y + box.height / 2,
  ];
};
