import type { Avatar } from "@nostakes/avatar";

import type { Friend, Seat } from "./lesson.js";

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

export const FRIEND_FACES: Readonly<Record<Friend, Avatar>> = {
  bo: plain,
  jonas: {
    ...plain,
    colour: "BlueYellow",
    eyewear: "Shades",
    mouth: "Line",
    neck: "Chain",
    rank: "King",
    species: "GreatWhite",
    suit: "Spade",
  },
  mara: {
    ...plain,
    colour: "RedPink",
    eyes: "Sleepy",
    headwear: "Visor",
    mouth: "Smirk",
    rank: "Queen",
    species: "Octopus",
    suit: "Club",
  },
};

export const LEARNER_FACE: Avatar = {
  ...plain,
  colour: "GreenYellow",
  eyes: "Beads",
  headwear: "Cap",
  mouth: "Grin",
  rank: "Ace",
  species: "Hammerhead",
  suit: "Diamond",
};

export const NAMES: Readonly<Record<Seat, string>> = {
  bo: "Bo",
  jonas: "Jonas",
  mara: "Mara",
  you: "You",
};
