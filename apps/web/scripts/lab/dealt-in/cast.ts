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

export const FRIEND_IDS = ["priya", "mara", "jonas", "bo", "kit"] as const;

export type FriendId = (typeof FRIEND_IDS)[number];

export type SeatId = FriendId | "you";

export interface Friend {
  readonly avatar: Avatar;
  readonly name: string;
}

export const FRIENDS: Readonly<Record<FriendId, Friend>> = {
  bo: { avatar: plain, name: "Bo" },
  jonas: {
    avatar: {
      ...plain,
      colour: "BlueYellow",
      eyewear: "Shades",
      mouth: "Line",
      neck: "Chain",
      rank: "King",
      species: "GreatWhite",
      suit: "Spade",
    },
    name: "Jonas",
  },
  kit: {
    avatar: {
      ...plain,
      colour: "GreenYellow",
      extra: "Toothpick",
      eyes: "Sleepy",
      headwear: "Cowboy",
      mouth: "Grin",
      rank: "Jack",
      species: "Whale",
      suit: "Diamond",
    },
    name: "Kit",
  },
  mara: {
    avatar: {
      ...plain,
      colour: "RedPink",
      eyes: "Sleepy",
      headwear: "Visor",
      mouth: "Smirk",
      rank: "Queen",
      species: "Octopus",
      suit: "Club",
    },
    name: "Mara",
  },
  priya: {
    avatar: {
      ...plain,
      colour: "PinkYellow",
      eyes: "Beads",
      eyewear: "Round",
      rank: "Seven",
      species: "Puffer",
      suit: "Diamond",
    },
    name: "Priya",
  },
};

export const STARTING_STACK = 1000;

export const SMALL_BLIND = 10;

export const BIG_BLIND = 20;

const SPECIES_WORDS: Readonly<Record<Avatar["species"], string>> = {
  Angler: "angler",
  Goldfish: "goldfish",
  GreatWhite: "great white",
  Hammerhead: "hammerhead",
  Octopus: "octopus",
  Piranha: "piranha",
  Puffer: "puffer",
  Whale: "whale",
};

const HEADWEAR_WORDS: Readonly<Record<Avatar["headwear"], string>> = {
  Bandana: "in the bandana",
  Cap: "in the cap",
  Cowboy: "in the cowboy hat",
  Crown: "in the crown",
  Fedora: "in the fedora",
  None: "",
  Visor: "in the visor",
};

const EYEWEAR_WORDS: Readonly<Record<Avatar["eyewear"], string>> = {
  Monocle: "with the monocle",
  None: "",
  Patch: "with the eye patch",
  Round: "in the round glasses",
  Shades: "in the shades",
};

const NECK_WORDS: Readonly<Record<Avatar["neck"], string>> = {
  Bolo: "in the bolo tie",
  BowTie: "in the bow tie",
  Chain: "with the gold chain",
  None: "",
};

const EXTRA_WORDS: Readonly<Record<Avatar["extra"], string>> = {
  Chip: "with the lucky chip",
  None: "",
  Toothpick: "with the toothpick",
};

export const faceLine = (avatar: Avatar) => {
  const wearing = [
    HEADWEAR_WORDS[avatar.headwear],
    EYEWEAR_WORDS[avatar.eyewear],
    NECK_WORDS[avatar.neck],
    EXTRA_WORDS[avatar.extra],
  ].find((words) => words.length > 0);

  const species = SPECIES_WORDS[avatar.species];

  return wearing === undefined
    ? `You're the ${species}. No frills.`
    : `You're the ${species} ${wearing}.`;
};
