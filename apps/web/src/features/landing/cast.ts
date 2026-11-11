import { DEFAULT_AVATAR } from "@nostakes/avatar";
import type { Avatar } from "@nostakes/avatar";

const plain: Avatar = {
  colour: "YellowRed",
  extra: "None",
  eyes: "Pips",
  eyewear: "None",
  headwear: "None",
  mark: "None",
  mouth: "Pucker",
  neck: "None",
  rank: "Two",
  species: "Goldfish",
  suit: "Heart",
};

export const CAST = {
  Ana: {
    ...plain,
    colour: "BluePink",
    headwear: "Crown",
    mouth: "Grin",
    neck: "Chain",
    rank: "Ace",
    species: "Whale",
    suit: "Diamond",
  },
  Ben: {
    ...plain,
    colour: "RedYellow",
    extra: "Toothpick",
    eyes: "Slits",
    eyewear: "Patch",
    headwear: "Bandana",
    mouth: "Smirk",
    rank: "Ten",
    species: "GreatWhite",
    suit: "Club",
  },
  Dev: {
    ...plain,
    colour: "RedPink",
    eyes: "Sleepy",
    mouth: "Line",
    rank: "Queen",
    species: "Octopus",
    suit: "Club",
  },
  Jonas: {
    ...plain,
    colour: "GreenYellow",
    eyes: "Slits",
    eyewear: "Shades",
    headwear: "Fedora",
    mouth: "Fangs",
    neck: "BowTie",
    rank: "Ace",
    species: "Hammerhead",
    suit: "Spade",
  },
  Kit: {
    ...plain,
    colour: "GreenPink",
    eyes: "Beads",
    headwear: "Visor",
    mark: "Chip",
    mouth: "Smirk",
    rank: "King",
    species: "Angler",
    suit: "Heart",
  },
  Lou: {
    ...plain,
    colour: "RedYellow",
    eyes: "Beads",
    headwear: "Cowboy",
    mouth: "GoldTooth",
    neck: "Bolo",
    rank: "Jack",
    species: "Piranha",
    suit: "Diamond",
  },
  Maya: { ...plain, headwear: "Cap", mouth: "Grin" },
  Priya: {
    ...plain,
    colour: "PinkYellow",
    eyewear: "Round",
    rank: "Seven",
    species: "Puffer",
  },
  Sam: DEFAULT_AVATAR,
} satisfies Readonly<Record<string, Avatar>>;

export type CastName = keyof typeof CAST;

export const RING: readonly CastName[] = [
  "Ben",
  "Jonas",
  "Maya",
  "Dev",
  "Sam",
  "Priya",
  "Kit",
  "Lou",
  "Ana",
];

export const TABLE: readonly CastName[] = [
  "Sam",
  "Maya",
  "Jonas",
  "Priya",
  "Dev",
  "Lou",
];

export const PREVIEW_CAST: readonly CastName[] = [
  "Maya",
  "Jonas",
  "Priya",
  "Dev",
  "Lou",
];

export const FLOP: readonly string[] = ["2c", "7h", "9s"];
