import { DEFAULT_AVATAR } from "@nostakes/avatar";
import type { Avatar, Expression } from "@nostakes/avatar";

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

export const SEATED: readonly CastName[] = [
  "Sam",
  "Maya",
  "Jonas",
  "Priya",
  "Dev",
];

export const OPEN_SEATS = 4;

export const WARDROBE: readonly CastName[] = ["Kit", "Lou", "Ana", "Dev"];

export const TOOTHPICK: CastName = "Ben";

export const SECOND_LOOKS: Readonly<Record<CastName, Expression>> = {
  Ana: "Happy",
  Ben: "Thinking",
  Dev: "LookingDown",
  Jonas: "Happy",
  Kit: "LookingDown",
  Lou: "Happy",
  Maya: "LookingDown",
  Priya: "Thinking",
  Sam: "LookingDown",
};
