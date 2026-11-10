export {
  cardLeaf,
  deckRoot,
  openCard,
  openDeck,
  saltFor,
  sealCards,
  sealDeck,
  verifyOpening,
} from "./commitment.js";

export type { SealedCard, SealedDeck } from "./commitment.js";

export { framed, taggedHash } from "./hashing.js";

export {
  inclusionPath,
  leafHash,
  nodeHash,
  rootFromInclusion,
  treeHead,
} from "./merkle.js";

export { OpeningMismatch } from "./rejection.js";

export {
  CardSchema,
  DealIndexSchema,
  DECK_SIZE,
  DeckOpeningSchema,
  DeckSchema,
  DeckSlotSchema,
  DIGEST_BYTES,
  DigestSchema,
  HandContextSchema,
  MAX_DEALT_IN,
  OpeningSchema,
  PositionSchema,
  SaltSchema,
  SaltSecretSchema,
  SEALED_DECKS,
} from "./schemas.js";

export type {
  Card,
  DealIndex,
  Deck,
  DeckOpening,
  DeckSlot,
  Digest,
  HandContext,
  Opening,
  Position,
  Salt,
  SaltSecret,
} from "./schemas.js";

export { hmacSha256, sha256 } from "./sha256.js";
