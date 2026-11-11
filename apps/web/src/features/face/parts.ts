import {
  choicesOf,
  PLACED_PARTS,
  reachOfPart,
  spotsOfPart,
} from "@nostakes/avatar";
import type { Avatar, Part, PlacedPart } from "@nostakes/avatar";

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

export type Side = "left" | "right";

export const SIDES: Readonly<Record<Side, readonly PlacedPart[]>> = {
  left: ["headwear", "eyes", "mouth", "neck"],
  right: ["rank", "eyewear", "mark", "extra"],
};

const sideOf = (part: PlacedPart): Side =>
  SIDES.left.includes(part) ? "left" : "right";

export interface CalloutPoint {
  readonly part: PlacedPart;
  readonly x: number;
  readonly y: number;
  readonly worn: boolean;
}

const NEAR_EDGE = 0.14;

export const DOTS_APART = 7;

const apart = (one: CalloutPoint, other: CalloutPoint) =>
  Math.hypot(one.x - other.x, one.y - other.y);

const clearOf = (point: CalloutPoint, placed: readonly CalloutPoint[]) =>
  placed.every((other) => apart(point, other) >= DOTS_APART);

const awayFrom = (
  point: CalloutPoint,
  placed: readonly CalloutPoint[]
): CalloutPoint => {
  const crowding = placed.find((other) => apart(point, other) < DOTS_APART);

  if (crowding === undefined) {
    return point;
  }

  const distance = apart(point, crowding);

  const [dx, dy] =
    distance === 0 ? [0, 1] : [point.x - crowding.x, point.y - crowding.y];

  const reach = DOTS_APART / (distance === 0 ? 1 : distance);

  return awayFrom(
    {
      ...point,
      x: crowding.x + dx * reach + (dx < 0 ? -0.01 : 0.01),
      y: crowding.y + dy * reach + (dy < 0 ? -0.01 : 0.01),
    },
    placed.filter((other) => other !== crowding)
  );
};

const wornPoints = (
  avatar: Avatar,
  part: PlacedPart
): readonly CalloutPoint[] =>
  spotsOfPart(avatar, part)
    .toSorted(([one], [other]) =>
      sideOf(part) === "left" ? one - other : other - one
    )
    .map(([x, y]) => ({ part, worn: true, x, y }));

const emptyPoint = (avatar: Avatar, part: PlacedPart): CalloutPoint => {
  const reach = reachOfPart(avatar.species, part);

  return {
    part,
    worn: false,
    x:
      reach.x +
      reach.width * (sideOf(part) === "left" ? NEAR_EDGE : 1 - NEAR_EDGE),
    y: reach.y + reach.height / 2,
  };
};

export const calloutPoints = (avatar: Avatar): readonly CalloutPoint[] => {
  const worn = PLACED_PARTS.filter((part) => avatar[part] !== "None");
  const empty = PLACED_PARTS.filter((part) => avatar[part] === "None");
  const placed: CalloutPoint[] = [];

  for (const part of worn) {
    const spots = wornPoints(avatar, part);
    const [first = emptyPoint(avatar, part)] = spots;

    placed.push(
      spots.find((spot) => clearOf(spot, placed)) ?? awayFrom(first, placed)
    );
  }

  for (const part of empty) {
    placed.push(awayFrom(emptyPoint(avatar, part), placed));
  }

  return placed;
};
