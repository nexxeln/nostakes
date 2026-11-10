import { Schema } from "effect";

export const SPECIES = [
  "GreatWhite",
  "Hammerhead",
  "Tiger",
  "Goldfish",
  "Puffer",
  "Piranha",
  "Betta",
  "Angler",
  "Whale",
  "Octopus",
] as const;

export const BODIES = [
  "Steel",
  "Slate",
  "Midnight",
  "Sand",
  "Orange",
  "Coral",
  "Lemon",
  "Bubblegum",
  "Grape",
  "Lagoon",
  "Sky",
  "Pearl",
] as const;

export const EYES = ["Round", "Sleepy", "Sharp", "Wide", "Beady"] as const;

export const MOUTHS = [
  "Smirk",
  "Grin",
  "Poker",
  "Pout",
  "Fangs",
  "GoldTooth",
] as const;

export const HEADWEAR = [
  "None",
  "Cowboy",
  "Fedora",
  "Visor",
  "Crown",
  "Bandana",
  "Headphones",
  "Cap",
  "Captain",
] as const;

export const EYEWEAR = [
  "None",
  "Shades",
  "Aviators",
  "Wraps",
  "Round",
  "Stars",
  "Monocle",
  "Specs",
  "Eyepatch",
] as const;

export const NECKWEAR = [
  "None",
  "Chain",
  "Medallion",
  "Bolo",
  "Bowtie",
  "Hoodie",
  "Pearls",
] as const;

export const TATTOOS = [
  "None",
  "Spade",
  "Teardrop",
  "Suits",
  "Dice",
  "Chip",
  "Anchor",
  "AllIn",
  "NoFold",
  "Scar",
] as const;

export const EXTRAS = [
  "None",
  "Toothpick",
  "Cigar",
  "Lollipop",
  "Hoop",
  "Bandaid",
  "Ace",
] as const;

export const BACKDROPS = [
  "Felt",
  "Reef",
  "Lagoon",
  "Deep",
  "Velvet",
  "Coral",
  "Sunset",
  "Lilac",
  "Sand",
  "Neon",
] as const;

export const EXPRESSIONS = [
  "Resting",
  "LookingDown",
  "Thinking",
  "Happy",
  "Gutted",
  "Folded",
] as const;

export const SpeciesSchema = Schema.Literals(SPECIES);

export const BodySchema = Schema.Literals(BODIES);

export const EyesSchema = Schema.Literals(EYES);

export const MouthSchema = Schema.Literals(MOUTHS);

export const HeadwearSchema = Schema.Literals(HEADWEAR);

export const EyewearSchema = Schema.Literals(EYEWEAR);

export const NeckwearSchema = Schema.Literals(NECKWEAR);

export const TattooSchema = Schema.Literals(TATTOOS);

export const ExtraSchema = Schema.Literals(EXTRAS);

export const BackdropSchema = Schema.Literals(BACKDROPS);

export const ExpressionSchema = Schema.Literals(EXPRESSIONS);

export type Species = typeof SpeciesSchema.Type;

export type Body = typeof BodySchema.Type;

export type Eyes = typeof EyesSchema.Type;

export type Mouth = typeof MouthSchema.Type;

export type Headwear = typeof HeadwearSchema.Type;

export type Eyewear = typeof EyewearSchema.Type;

export type Neckwear = typeof NeckwearSchema.Type;

export type Tattoo = typeof TattooSchema.Type;

export type Extra = typeof ExtraSchema.Type;

export type Backdrop = typeof BackdropSchema.Type;

export type Expression = typeof ExpressionSchema.Type;

export const AvatarSchema = Schema.Struct({
  backdrop: BackdropSchema,
  body: BodySchema,
  extra: ExtraSchema,
  eyes: EyesSchema,
  eyewear: EyewearSchema,
  headwear: HeadwearSchema,
  mouth: MouthSchema,
  neck: NeckwearSchema,
  species: SpeciesSchema,
  tattoo: TattooSchema,
});

export type Avatar = typeof AvatarSchema.Type;

export const DEFAULT_AVATAR: Avatar = {
  backdrop: "Felt",
  body: "Steel",
  extra: "None",
  eyes: "Sleepy",
  eyewear: "Shades",
  headwear: "None",
  mouth: "Smirk",
  neck: "Chain",
  species: "GreatWhite",
  tattoo: "Spade",
};
