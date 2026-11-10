import { Schema } from "effect";

export const SPECIES = [
  "Cat",
  "Bear",
  "Bunny",
  "Fox",
  "Frog",
  "Mouse",
  "Dog",
] as const;

export const FURS = [
  "Cream",
  "Honey",
  "Ginger",
  "Cocoa",
  "Charcoal",
  "Cloud",
  "Pink",
  "Mint",
  "Lilac",
  "Sky",
  "Lemon",
  "Sage",
] as const;

export const MARKINGS = [
  "Plain",
  "Muzzle",
  "Mask",
  "Patch",
  "Stripes",
] as const;

export const EYES = ["Dots", "Shiny", "Lashes", "Button"] as const;

export const MOUTHS = ["Smile", "Kitty", "Toothy", "Blep", "Grin"] as const;

export const CHEEKS = ["Rosy", "Freckles", "Bare"] as const;

export const ACCESSORIES = [
  "None",
  "Bow",
  "Beanie",
  "Glasses",
  "Flower",
  "Visor",
  "Headphones",
  "Crown",
  "PartyHat",
] as const;

export const ACCENTS = [
  "Cherry",
  "Coral",
  "Sun",
  "Leaf",
  "Ocean",
  "Grape",
  "Bubblegum",
  "Ink",
] as const;

export const BACKDROPS = [
  "Peach",
  "Butter",
  "Mint",
  "Sky",
  "Lilac",
  "Rose",
  "Sage",
  "Sand",
  "Felt",
  "Teal",
  "Navy",
  "Plum",
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

export const FurSchema = Schema.Literals(FURS);

export const MarkingSchema = Schema.Literals(MARKINGS);

export const EyesSchema = Schema.Literals(EYES);

export const MouthSchema = Schema.Literals(MOUTHS);

export const CheeksSchema = Schema.Literals(CHEEKS);

export const AccessorySchema = Schema.Literals(ACCESSORIES);

export const AccentSchema = Schema.Literals(ACCENTS);

export const BackdropSchema = Schema.Literals(BACKDROPS);

export const ExpressionSchema = Schema.Literals(EXPRESSIONS);

export type Species = typeof SpeciesSchema.Type;

export type Fur = typeof FurSchema.Type;

export type Marking = typeof MarkingSchema.Type;

export type Eyes = typeof EyesSchema.Type;

export type Mouth = typeof MouthSchema.Type;

export type Cheeks = typeof CheeksSchema.Type;

export type Accessory = typeof AccessorySchema.Type;

export type Accent = typeof AccentSchema.Type;

export type Backdrop = typeof BackdropSchema.Type;

export type Expression = typeof ExpressionSchema.Type;

export const AvatarSchema = Schema.Struct({
  accent: AccentSchema,
  accessory: AccessorySchema,
  backdrop: BackdropSchema,
  cheeks: CheeksSchema,
  eyes: EyesSchema,
  fur: FurSchema,
  marking: MarkingSchema,
  mouth: MouthSchema,
  species: SpeciesSchema,
});

export type Avatar = typeof AvatarSchema.Type;

export const DEFAULT_AVATAR: Avatar = {
  accent: "Cherry",
  accessory: "None",
  backdrop: "Peach",
  cheeks: "Rosy",
  eyes: "Shiny",
  fur: "Honey",
  marking: "Muzzle",
  mouth: "Kitty",
  species: "Bear",
};
