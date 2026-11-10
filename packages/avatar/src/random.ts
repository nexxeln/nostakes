import { BACKDROPS, BODIES } from "./avatar.js";
import type {
  Avatar,
  Backdrop,
  Body,
  Extra,
  Eyes,
  Eyewear,
  Headwear,
  Mouth,
  Neckwear,
  Species,
  Tattoo,
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
  ["Tiger", 3],
  ["Goldfish", 4],
  ["Puffer", 3],
  ["Piranha", 3],
  ["Betta", 3],
  ["Angler", 2],
  ["Whale", 3],
  ["Octopus", 3],
];

const NATIVE_BODIES: Readonly<Record<Species, Weighted<Body>>> = {
  Angler: [
    ["Midnight", 3],
    ["Grape", 2],
    ["Slate", 2],
    ["Lagoon", 1],
  ],
  Betta: [
    ["Grape", 3],
    ["Coral", 2],
    ["Sky", 2],
    ["Bubblegum", 2],
    ["Lagoon", 1],
  ],
  Goldfish: [
    ["Orange", 5],
    ["Lemon", 2],
    ["Coral", 2],
    ["Pearl", 1],
    ["Bubblegum", 1],
  ],
  GreatWhite: [
    ["Steel", 5],
    ["Slate", 2],
    ["Sky", 2],
    ["Midnight", 1],
    ["Pearl", 1],
  ],
  Hammerhead: [
    ["Steel", 3],
    ["Slate", 2],
    ["Lagoon", 2],
    ["Sand", 1],
    ["Grape", 1],
  ],
  Octopus: [
    ["Coral", 3],
    ["Grape", 2],
    ["Bubblegum", 2],
    ["Orange", 1],
    ["Lagoon", 1],
  ],
  Piranha: [
    ["Steel", 3],
    ["Slate", 3],
    ["Grape", 1],
    ["Midnight", 1],
  ],
  Puffer: [
    ["Lemon", 4],
    ["Sand", 2],
    ["Sky", 1],
    ["Bubblegum", 1],
    ["Orange", 1],
  ],
  Tiger: [
    ["Sand", 3],
    ["Steel", 2],
    ["Orange", 1],
    ["Lagoon", 1],
  ],
  Whale: [
    ["Midnight", 3],
    ["Sky", 3],
    ["Slate", 2],
    ["Grape", 1],
  ],
};

const CLASHES: Readonly<Record<Body, readonly Backdrop[]>> = {
  Bubblegum: ["Neon", "Coral", "Lilac"],
  Coral: ["Coral", "Neon", "Velvet"],
  Grape: ["Lilac", "Velvet", "Deep"],
  Lagoon: ["Lagoon", "Reef", "Felt"],
  Lemon: ["Sunset", "Sand"],
  Midnight: ["Deep", "Velvet", "Felt", "Reef"],
  Orange: ["Sunset", "Coral", "Sand"],
  Pearl: ["Sand", "Lagoon", "Lilac"],
  Sand: ["Sand", "Sunset"],
  Sky: ["Lagoon", "Lilac"],
  Slate: ["Deep", "Velvet", "Felt"],
  Steel: ["Lilac", "Lagoon"],
};

const EYE_WEIGHTS: Weighted<Eyes> = [
  ["Round", 3],
  ["Sleepy", 3],
  ["Sharp", 3],
  ["Wide", 2],
  ["Beady", 2],
];

const MOUTH_WEIGHTS: Weighted<Mouth> = [
  ["Smirk", 4],
  ["Grin", 3],
  ["Poker", 2],
  ["Pout", 2],
  ["Fangs", 2],
  ["GoldTooth", 2],
];

const HEADWEAR_WEIGHTS: Weighted<Headwear> = [
  ["None", 17],
  ["Cowboy", 3],
  ["Fedora", 3],
  ["Visor", 2],
  ["Crown", 2],
  ["Bandana", 2],
  ["Headphones", 2],
  ["Cap", 2],
  ["Captain", 2],
];

const EYEWEAR_WEIGHTS: Weighted<Eyewear> = [
  ["None", 13],
  ["Shades", 5],
  ["Aviators", 3],
  ["Wraps", 2],
  ["Round", 2],
  ["Stars", 1],
  ["Monocle", 1],
  ["Specs", 1],
  ["Eyepatch", 1],
];

const NECK_WEIGHTS: Weighted<Neckwear> = [
  ["None", 8],
  ["Chain", 6],
  ["Medallion", 3],
  ["Bolo", 2],
  ["Bowtie", 2],
  ["Hoodie", 2],
  ["Pearls", 1],
];

const TATTOO_WEIGHTS: Weighted<Tattoo> = [
  ["None", 12],
  ["Spade", 3],
  ["Teardrop", 2],
  ["Suits", 2],
  ["Dice", 1],
  ["Chip", 1],
  ["Anchor", 1],
  ["AllIn", 1],
  ["NoFold", 1],
  ["Scar", 2],
];

const EXTRA_WEIGHTS: Weighted<Extra> = [
  ["None", 14],
  ["Toothpick", 3],
  ["Cigar", 2],
  ["Lollipop", 1],
  ["Hoop", 2],
  ["Bandaid", 1],
  ["Ace", 2],
];

const MOST_WORN = 3;

const NATIVE_CHANCE_IN_TEN = 8;

const wornCount = (avatar: Avatar) =>
  [
    avatar.headwear !== "None",
    avatar.eyewear !== "None",
    avatar.neck !== "None",
    avatar.tattoo !== "None",
    avatar.extra !== "None",
  ].filter(Boolean).length;

const pareDown = (avatar: Avatar): Avatar => {
  if (wornCount(avatar) <= MOST_WORN) {
    return avatar;
  }

  if (avatar.extra !== "None") {
    return pareDown({ ...avatar, extra: "None" });
  }

  return avatar.tattoo === "None"
    ? { ...avatar, neck: "None" }
    : pareDown({ ...avatar, tattoo: "None" });
};

export const randomAvatar = (seed: number): Avatar => {
  const start = advanceBy(
    1 + (Math.abs(Math.trunc(seed)) % (PARK_MILLER_MODULUS - 1)),
    WARM_UP_STEPS
  );

  const roll = (field: number) => advanceBy(start, field + 1);

  const species = pick(SPECIES_WEIGHTS, roll(0));

  const body =
    roll(1) % 10 < NATIVE_CHANCE_IN_TEN
      ? pick(NATIVE_BODIES[species], roll(2))
      : pick(evenly(BODIES), roll(2));

  const clashes = CLASHES[body];
  const backdrops = BACKDROPS.filter((backdrop) => !clashes.includes(backdrop));
  const [firstBackdrop = "Felt", ...otherBackdrops] = backdrops;

  return pareDown({
    backdrop: pick(evenly([firstBackdrop, ...otherBackdrops]), roll(3)),
    body,
    extra: pick(EXTRA_WEIGHTS, roll(4)),
    eyes: pick(EYE_WEIGHTS, roll(5)),
    eyewear: pick(EYEWEAR_WEIGHTS, roll(6)),
    headwear: pick(HEADWEAR_WEIGHTS, roll(7)),
    mouth: pick(MOUTH_WEIGHTS, roll(8)),
    neck: pick(NECK_WEIGHTS, roll(9)),
    species,
    tattoo: pick(TATTOO_WEIGHTS, roll(10)),
  });
};
