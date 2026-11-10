import { Array as Arr, Option, Result } from "effect";

import { sameBytes, uint32, utf8 } from "./bytes.js";
import { DOMAIN, framed } from "./hashing.js";
import {
  inclusionPath,
  leafHash,
  rootFromInclusion,
  treeHead,
} from "./merkle.js";
import { OpeningMismatch } from "./rejection.js";
import {
  DECK_SIZE,
  DigestSchema,
  PositionSchema,
  SaltSchema,
} from "./schemas.js";
import type {
  Card,
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
import { hmacSha256 } from "./sha256.js";

export interface SealedCard {
  readonly card: Card;
  readonly salt: Salt;
  readonly leaf: Uint8Array;
}

export interface SealedDeck {
  readonly context: HandContext;
  readonly slot: DeckSlot;
  readonly cards: readonly SealedCard[];
  readonly root: Digest;
}

export const saltFor = (
  secret: SaltSecret,
  slot: DeckSlot,
  position: Position
): Salt =>
  SaltSchema.make(
    hmacSha256(
      secret,
      framed([utf8(`${DOMAIN}/salt`), Uint8Array.of(slot, position)])
    )
  );

export const cardLeaf = (
  context: HandContext,
  slot: DeckSlot,
  position: Position,
  card: Card,
  salt: Uint8Array
): Uint8Array =>
  leafHash(
    framed([
      utf8(`${DOMAIN}/card`),
      utf8(context.room),
      uint32(context.hand),
      Uint8Array.of(slot, position, card),
      salt,
    ])
  );

export const sealCards = (
  context: HandContext,
  slot: DeckSlot,
  cards: readonly Card[],
  salts: readonly Salt[]
): SealedDeck => {
  const sealed = Arr.zip(cards, salts).map(([card, salt], position) => ({
    card,
    leaf: cardLeaf(context, slot, PositionSchema.make(position), card, salt),
    salt,
  }));

  return {
    cards: sealed,
    context,
    root: DigestSchema.make(treeHead(sealed.map(({ leaf }) => leaf))),
    slot,
  };
};

export const sealDeck = (
  context: HandContext,
  slot: DeckSlot,
  deck: Deck,
  secret: SaltSecret
): SealedDeck =>
  sealCards(
    context,
    slot,
    deck,
    deck.map((_, position) =>
      saltFor(secret, slot, PositionSchema.make(position))
    )
  );

export const openCard = (
  sealed: SealedDeck,
  position: Position
): Option.Option<Opening> =>
  Arr.get(sealed.cards, position).pipe(
    Option.map(({ card, salt }) => ({
      card,
      path: inclusionPath(
        position,
        sealed.cards.map(({ leaf }) => leaf)
      ).map((node) => DigestSchema.make(node)),
      position,
      salt,
    }))
  );

export const openDeck = (sealed: SealedDeck): DeckOpening => ({
  cards: sealed.cards.map(({ card }) => card),
  salts: sealed.cards.map(({ salt }) => salt),
});

export const verifyOpening = (
  context: HandContext,
  slot: DeckSlot,
  root: Digest,
  opening: Opening
): Result.Result<Opening, OpeningMismatch> => {
  const leaf = cardLeaf(
    context,
    slot,
    opening.position,
    opening.card,
    opening.salt
  );

  const recomputed = rootFromInclusion(
    opening.position,
    DECK_SIZE,
    leaf,
    opening.path
  );

  return Option.exists(recomputed, (candidate) => sameBytes(candidate, root))
    ? Result.succeed(opening)
    : Result.fail(new OpeningMismatch({ position: opening.position, slot }));
};

export const deckRoot = (
  context: HandContext,
  slot: DeckSlot,
  opening: DeckOpening
): Digest => sealCards(context, slot, opening.cards, opening.salts).root;
