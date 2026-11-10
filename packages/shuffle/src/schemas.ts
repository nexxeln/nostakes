import { Data, Schema } from "effect";

export const DECK_SIZE = 52;

export const DIGEST_BYTES = 32;

export const SEALED_DECKS = 2;

export const MAX_DEALT_IN = 9;

const deckIndex = Schema.Int.check(
  Schema.isBetween({ maximum: DECK_SIZE - 1, minimum: 0 })
);

const thirtyTwoBytes = Schema.Uint8Array.check(
  Schema.isMinLength(DIGEST_BYTES),
  Schema.isMaxLength(DIGEST_BYTES)
);

export const CardSchema = deckIndex.pipe(Schema.brand("Card"));

export type Card = typeof CardSchema.Type;

export const PositionSchema = deckIndex.pipe(Schema.brand("Position"));

export type Position = typeof PositionSchema.Type;

export const DealIndexSchema = deckIndex.pipe(Schema.brand("DealIndex"));

export type DealIndex = typeof DealIndexSchema.Type;

export const DeckSlotSchema = Schema.Literals([0, 1]);

export type DeckSlot = typeof DeckSlotSchema.Type;

export const DigestSchema = thirtyTwoBytes.pipe(Schema.brand("Digest"));

export type Digest = typeof DigestSchema.Type;

export const SaltSchema = thirtyTwoBytes.pipe(Schema.brand("Salt"));

export type Salt = typeof SaltSchema.Type;

export const SaltSecretSchema = thirtyTwoBytes.pipe(Schema.brand("SaltSecret"));

export type SaltSecret = typeof SaltSecretSchema.Type;

export const DeckSchema = Schema.Array(CardSchema)
  .check(
    Schema.isMinLength(DECK_SIZE),
    Schema.isMaxLength(DECK_SIZE),
    Schema.isUnique()
  )
  .pipe(Schema.brand("Deck"));

export type Deck = typeof DeckSchema.Type;

export const HandContextSchema = Schema.Struct({
  hand: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  room: Schema.String.check(Schema.isMinLength(1)),
});

export type HandContext = typeof HandContextSchema.Type;

export const OpeningSchema = Schema.Struct({
  card: CardSchema,
  path: Schema.Array(DigestSchema),
  position: PositionSchema,
  salt: SaltSchema,
});

export type Opening = typeof OpeningSchema.Type;

export const DeckOpeningSchema = Schema.Struct({
  cards: Schema.Array(CardSchema).check(
    Schema.isMinLength(DECK_SIZE),
    Schema.isMaxLength(DECK_SIZE)
  ),
  salts: Schema.Array(SaltSchema).check(
    Schema.isMinLength(DECK_SIZE),
    Schema.isMaxLength(DECK_SIZE)
  ),
});

export type DeckOpening = typeof DeckOpeningSchema.Type;

export const RandomnessSchema = thirtyTwoBytes.pipe(Schema.brand("Randomness"));

export type Randomness = typeof RandomnessSchema.Type;

export const SeedSchema = thirtyTwoBytes.pipe(Schema.brand("Seed"));

export type Seed = typeof SeedSchema.Type;

export const SeatSchema = Schema.Int.check(
  Schema.isBetween({ maximum: MAX_DEALT_IN - 1, minimum: 0 })
);

export const BeaconRoundSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1)
);

export type BeaconRound = typeof BeaconRoundSchema.Type;

export const EpochMillisSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("EpochMillis"));

export type EpochMillis = typeof EpochMillisSchema.Type;

export const ContributionSchema = Schema.TaggedUnion({
  Beacon: { randomness: RandomnessSchema, round: BeaconRoundSchema },
  Player: { seat: SeatSchema, value: RandomnessSchema },
});

export type Contribution = typeof ContributionSchema.Type;

export type PlayerContribution = typeof ContributionSchema.cases.Player.Type;

export const Contributions = Data.taggedEnum<Contribution>();

export const SealSchema = Schema.Struct({
  beaconRound: Schema.Option(BeaconRoundSchema),
  roots: Schema.Tuple([DigestSchema, DigestSchema]),
});

export type Seal = typeof SealSchema.Type;

export const RoleSchema = Schema.TaggedUnion({
  Community: {
    drawn: Schema.Int.check(
      Schema.isBetween({ maximum: DECK_SIZE - 1, minimum: 0 })
    ),
  },
  Hole: { pass: Schema.Literals([0, 1]), turn: SeatSchema },
});

export type Role = typeof RoleSchema.Type;

export const Roles = Data.taggedEnum<Role>();

export const SightingSchema = Schema.Struct({
  opening: OpeningSchema,
  role: RoleSchema,
  shown: CardSchema,
});

export type Sighting = typeof SightingSchema.Type;

export const PlayerSawSchema = Schema.Struct({
  context: HandContextSchema,
  contributions: Schema.Array(ContributionSchema),
  dealtIn: Schema.Int.check(
    Schema.isBetween({ maximum: MAX_DEALT_IN, minimum: 2 })
  ),
  mine: Schema.Option(ContributionSchema.cases.Player),
  seal: SealSchema,
  sightings: Schema.Array(SightingSchema),
  spare: DeckOpeningSchema,
});

export type PlayerSaw = typeof PlayerSawSchema.Type;
