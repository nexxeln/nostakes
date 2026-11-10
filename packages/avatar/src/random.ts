import { COLOURS, RANKS, SUITS } from "./avatar.js";
import type {
  Avatar,
  Colour,
  Extra,
  Eyes,
  Eyewear,
  Headwear,
  Mark,
  Mouth,
  Neckwear,
  Rank,
  Species,
  Suit,
} from "./avatar.js";

type Weighted<T> = readonly [
  readonly [T, number],
  ...(readonly (readonly [T, number])[]),
];

const PARK_MILLER_MODULUS = 2_147_483_647;

const PARK_MILLER_MULTIPLIER = 48_271;

const TEXT_BASE = 131;

const WARM_UP_STEPS = 6;

const advance = (state: number) =>
  (state * PARK_MILLER_MULTIPLIER) % PARK_MILLER_MODULUS;

const advanceBy = (state: number, steps: number): number =>
  steps === 0 ? state : advanceBy(advance(state), steps - 1);

export const seedFrom = (text: string) =>
  Array.from({ length: text.length }, (_, index) =>
    text.codePointAt(index)
  ).reduce<number>(
    (hash, unit) => (hash * TEXT_BASE + (unit ?? 0)) % PARK_MILLER_MODULUS,
    7
  );

const pick = <T>(choices: Weighted<T>, state: number): T => {
  let total = 0;

  for (const [, weight] of choices) {
    total += weight;
  }

  let left = state % total;

  for (const [choice, weight] of choices) {
    if (left < weight) {
      return choice;
    }

    left -= weight;
  }

  return choices[0][0];
};

const evenly = <T>(choices: readonly [T, ...(readonly T[])]): Weighted<T> => {
  const [first, ...rest] = choices;

  return [[first, 1], ...rest.map((choice) => [choice, 1] as const)];
};

const SPECIES_WEIGHTS: Weighted<Species> = [
  ["GreatWhite", 4],
  ["Hammerhead", 3],
  ["Goldfish", 4],
  ["Puffer", 3],
  ["Piranha", 3],
  ["Angler", 2],
  ["Whale", 3],
  ["Octopus", 3],
];

interface Native {
  readonly colours: Weighted<Colour>;
  readonly suit: Suit;
  readonly rank: Rank;
  readonly mouths: Weighted<Mouth>;
}

const SHARK_MOUTHS: Weighted<Mouth> = [
  ["Line", 4],
  ["Smirk", 3],
  ["Grin", 2],
  ["Fangs", 2],
  ["GoldTooth", 1],
];

const FISH_MOUTHS: Weighted<Mouth> = [
  ["Pucker", 5],
  ["Smirk", 1],
  ["Line", 1],
  ["Grin", 1],
];

const NATIVE: Readonly<Record<Species, Native>> = {
  Angler: {
    colours: [
      ["BlueYellow", 2],
      ["GreenYellow", 2],
      ["RedYellow", 1],
    ],
    mouths: [
      ["Fangs", 5],
      ["Grin", 1],
    ],
    rank: "Ten",
    suit: "Club",
  },
  Goldfish: {
    colours: [
      ["YellowRed", 4],
      ["PinkYellow", 2],
      ["RedPink", 2],
    ],
    mouths: FISH_MOUTHS,
    rank: "Two",
    suit: "Heart",
  },
  GreatWhite: {
    colours: [
      ["BlueYellow", 4],
      ["GreenYellow", 2],
      ["RedYellow", 2],
      ["BluePink", 1],
    ],
    mouths: SHARK_MOUTHS,
    rank: "King",
    suit: "Spade",
  },
  Hammerhead: {
    colours: [
      ["GreenYellow", 3],
      ["BlueYellow", 2],
      ["BluePink", 2],
      ["RedYellow", 1],
    ],
    mouths: SHARK_MOUTHS,
    rank: "Ace",
    suit: "Spade",
  },
  Octopus: {
    colours: [
      ["RedPink", 3],
      ["BlueYellow", 2],
      ["GreenPink", 2],
    ],
    mouths: [
      ["Line", 3],
      ["Smirk", 2],
      ["Pucker", 2],
      ["Grin", 1],
    ],
    rank: "Queen",
    suit: "Club",
  },
  Piranha: {
    colours: [
      ["RedYellow", 3],
      ["GreenPink", 1],
      ["BlueYellow", 1],
      ["RedPink", 1],
    ],
    mouths: [
      ["Fangs", 4],
      ["Grin", 2],
      ["GoldTooth", 1],
    ],
    rank: "Jack",
    suit: "Diamond",
  },
  Puffer: {
    colours: [
      ["YellowRed", 3],
      ["PinkYellow", 2],
      ["GreenPink", 1],
      ["BluePink", 1],
    ],
    mouths: FISH_MOUTHS,
    rank: "Seven",
    suit: "Heart",
  },
  Whale: {
    colours: [
      ["PinkYellow", 3],
      ["BluePink", 2],
      ["YellowRed", 1],
    ],
    mouths: [
      ["Line", 4],
      ["Smirk", 1],
      ["Grin", 1],
    ],
    rank: "King",
    suit: "Diamond",
  },
};

const EYE_WEIGHTS: Weighted<Eyes> = [
  ["Pips", 5],
  ["Beads", 2],
  ["Sleepy", 2],
  ["Slits", 2],
];

const HEADWEAR_WEIGHTS: Weighted<Headwear> = [
  ["None", 14],
  ["Cowboy", 2],
  ["Fedora", 2],
  ["Visor", 2],
  ["Crown", 2],
  ["Bandana", 2],
  ["Cap", 2],
];

const EYEWEAR_WEIGHTS: Weighted<Eyewear> = [
  ["None", 12],
  ["Shades", 5],
  ["Round", 2],
  ["Monocle", 1],
  ["Patch", 1],
];

const NECK_WEIGHTS: Weighted<Neckwear> = [
  ["None", 8],
  ["Chain", 5],
  ["BowTie", 2],
  ["Bolo", 2],
];

const MARK_WEIGHTS: Weighted<Mark> = [
  ["None", 12],
  ["Pips", 2],
  ["Index", 2],
  ["Chip", 1],
  ["Dice", 1],
  ["Teardrop", 1],
  ["Scar", 1],
];

const EXTRA_WEIGHTS: Weighted<Extra> = [
  ["None", 14],
  ["Toothpick", 3],
  ["Chip", 2],
];

const MOST_WORN = 3;

const NATIVE_CHANCE_IN_TEN = 8;

const NATIVE_CARD_IN_TEN = 6;

const wornCount = (avatar: Avatar) =>
  [
    avatar.headwear !== "None",
    avatar.eyewear !== "None",
    avatar.neck !== "None",
    avatar.mark !== "None",
    avatar.extra !== "None",
  ].filter(Boolean).length;

const pareDown = (avatar: Avatar): Avatar => {
  if (wornCount(avatar) <= MOST_WORN) {
    return avatar;
  }

  if (avatar.extra !== "None") {
    return pareDown({ ...avatar, extra: "None" });
  }

  return avatar.mark === "None"
    ? { ...avatar, neck: "None" }
    : pareDown({ ...avatar, mark: "None" });
};

export const randomAvatar = (seed: number): Avatar => {
  const start = advanceBy(
    1 + (Math.abs(Math.trunc(seed)) % (PARK_MILLER_MODULUS - 1)),
    WARM_UP_STEPS
  );

  const roll = (field: number) => advanceBy(start, field + 1);

  const species = pick(SPECIES_WEIGHTS, roll(0));
  const native = NATIVE[species];
  const ownCard = roll(11) % 10 < NATIVE_CARD_IN_TEN;

  return pareDown({
    colour:
      roll(1) % 10 < NATIVE_CHANCE_IN_TEN
        ? pick(native.colours, roll(2))
        : pick(evenly(COLOURS), roll(2)),
    extra: pick(EXTRA_WEIGHTS, roll(3)),
    eyes: pick(EYE_WEIGHTS, roll(4)),
    eyewear: pick(EYEWEAR_WEIGHTS, roll(5)),
    headwear: pick(HEADWEAR_WEIGHTS, roll(6)),
    mark: pick(MARK_WEIGHTS, roll(7)),
    mouth: pick(native.mouths, roll(8)),
    neck: pick(NECK_WEIGHTS, roll(9)),
    rank: ownCard ? native.rank : pick(evenly(RANKS), roll(10)),
    species,
    suit: ownCard ? native.suit : pick(evenly(SUITS), roll(12)),
  });
};
