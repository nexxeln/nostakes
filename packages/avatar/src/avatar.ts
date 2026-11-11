import { Schema } from "effect";

export const SPECIES = [
  "GreatWhite",
  "Hammerhead",
  "Goldfish",
  "Puffer",
  "Piranha",
  "Angler",
  "Whale",
  "Octopus",
] as const;

export const COLOURS = [
  "BlueYellow",
  "BluePink",
  "GreenYellow",
  "GreenPink",
  "RedYellow",
  "RedPink",
  "YellowRed",
  "PinkYellow",
] as const;

export const SUITS = ["Spade", "Heart", "Diamond", "Club"] as const;

export const RANKS = [
  "Ace",
  "King",
  "Queen",
  "Jack",
  "Ten",
  "Seven",
  "Two",
] as const;

export const EYES = ["Pips", "Beads", "Sleepy", "Slits"] as const;

export const MOUTHS = [
  "Line",
  "Smirk",
  "Grin",
  "Fangs",
  "GoldTooth",
  "Pucker",
] as const;

export const HEADWEAR = [
  "None",
  "Cowboy",
  "Fedora",
  "Visor",
  "Crown",
  "Bandana",
  "Cap",
] as const;

export const EYEWEAR = ["None", "Shades", "Round", "Monocle", "Patch"] as const;

export const NECKWEAR = ["None", "Chain", "BowTie", "Bolo"] as const;

export const MARKS = [
  "None",
  "Pips",
  "Index",
  "Chip",
  "Dice",
  "Teardrop",
  "Scar",
] as const;

export const EXTRAS = ["None", "Toothpick", "Chip"] as const;

export const EXPRESSIONS = [
  "Resting",
  "LookingDown",
  "Thinking",
  "Happy",
  "Gutted",
  "Folded",
] as const;

export const THEMES = ["Light", "Dark"] as const;

export const SpeciesSchema = Schema.Literals(SPECIES);

export const ColourSchema = Schema.Literals(COLOURS);

export const SuitSchema = Schema.Literals(SUITS);

export const RankSchema = Schema.Literals(RANKS);

export const EyesSchema = Schema.Literals(EYES);

export const MouthSchema = Schema.Literals(MOUTHS);

export const HeadwearSchema = Schema.Literals(HEADWEAR);

export const EyewearSchema = Schema.Literals(EYEWEAR);

export const NeckwearSchema = Schema.Literals(NECKWEAR);

export const MarkSchema = Schema.Literals(MARKS);

export const ExtraSchema = Schema.Literals(EXTRAS);

export const ExpressionSchema = Schema.Literals(EXPRESSIONS);

export const ThemeSchema = Schema.Literals(THEMES);

export type Species = typeof SpeciesSchema.Type;

export type Colour = typeof ColourSchema.Type;

export type Suit = typeof SuitSchema.Type;

export type Rank = typeof RankSchema.Type;

export type Eyes = typeof EyesSchema.Type;

export type Mouth = typeof MouthSchema.Type;

export type Headwear = typeof HeadwearSchema.Type;

export type Eyewear = typeof EyewearSchema.Type;

export type Neckwear = typeof NeckwearSchema.Type;

export type Mark = typeof MarkSchema.Type;

export type Extra = typeof ExtraSchema.Type;

export type Expression = typeof ExpressionSchema.Type;

export type Theme = typeof ThemeSchema.Type;

export const AvatarSchema = Schema.Struct({
  colour: ColourSchema,
  extra: ExtraSchema,
  eyes: EyesSchema,
  eyewear: EyewearSchema,
  headwear: HeadwearSchema,
  mark: MarkSchema,
  mouth: MouthSchema,
  neck: NeckwearSchema,
  rank: RankSchema,
  species: SpeciesSchema,
  suit: SuitSchema,
});

export type Avatar = typeof AvatarSchema.Type;

export const PARTS = [
  "species",
  "colour",
  "suit",
  "rank",
  "eyes",
  "mouth",
  "headwear",
  "eyewear",
  "neck",
  "mark",
  "extra",
] as const satisfies readonly (keyof Avatar)[];

export const PLACED_PARTS = [
  "rank",
  "eyes",
  "mouth",
  "headwear",
  "eyewear",
  "neck",
  "mark",
  "extra",
] as const satisfies readonly (keyof Avatar)[];

export const PLACELESS_PARTS = [
  "species",
  "colour",
  "suit",
] as const satisfies readonly (keyof Avatar)[];

export const PartSchema = Schema.Literals(PARTS);

export const PlacedPartSchema = Schema.Literals(PLACED_PARTS);

export type Part = typeof PartSchema.Type;

export type PlacedPart = typeof PlacedPartSchema.Type;

export const CHOICES = {
  colour: COLOURS,
  extra: EXTRAS,
  eyes: EYES,
  eyewear: EYEWEAR,
  headwear: HEADWEAR,
  mark: MARKS,
  mouth: MOUTHS,
  neck: NECKWEAR,
  rank: RANKS,
  species: SPECIES,
  suit: SUITS,
} as const satisfies { readonly [Name in Part]: readonly Avatar[Name][] };

export const choicesOf = (part: Part): readonly string[] => CHOICES[part];

export const DEFAULT_AVATAR: Avatar = {
  colour: "BlueYellow",
  extra: "None",
  eyes: "Pips",
  eyewear: "Shades",
  headwear: "None",
  mark: "None",
  mouth: "Line",
  neck: "Chain",
  rank: "King",
  species: "GreatWhite",
  suit: "Spade",
};
