import { Schema, SchemaTransformation } from "effect";

export const RANKS = 13;

export const SUITS = 4;

export const DECK_SIZE = 52;

export const CardSchema = Schema.Int.check(
  Schema.isBetween({ maximum: DECK_SIZE - 1, minimum: 0 })
).pipe(Schema.brand("Card"));

export type Card = typeof CardSchema.Type;

const RANK_SYMBOLS = "23456789TJQKA";

const SUIT_SYMBOLS = "cdhs";

const cardTable = () => {
  const ranks: number[] = [];
  const suits: number[] = [];
  const texts: string[] = [];

  for (let rank = 0; rank < RANKS; rank += 1) {
    for (let suit = 0; suit < SUITS; suit += 1) {
      ranks.push(rank);
      suits.push(suit);
      texts.push(`${RANK_SYMBOLS.charAt(rank)}${SUIT_SYMBOLS.charAt(suit)}`);
    }
  }

  return { ranks, suits, texts };
};

const CARDS = cardTable();

export const CARD_RANKS: readonly number[] = CARDS.ranks;

export const CARD_SUITS: readonly number[] = CARDS.suits;

export const rankOf = (card: Card) => CARD_RANKS[card] ?? 0;

export const suitOf = (card: Card) => CARD_SUITS[card] ?? 0;

export const cardText = (card: Card) => CARDS.texts[card] ?? "";

export const CardFromText = Schema.String.check(
  Schema.isPattern(/^[2-9TJQKA][cdhs]$/u)
).pipe(
  Schema.decodeTo(
    CardSchema,
    SchemaTransformation.transform({
      decode: (text: string) =>
        RANK_SYMBOLS.indexOf(text.charAt(0)) * SUITS +
        SUIT_SYMBOLS.indexOf(text.charAt(1)),
      encode: (card: number) => CARDS.texts[card] ?? "",
    })
  )
);

export const DeckSchema = Schema.Array(CardSchema)
  .check(
    Schema.isMinLength(DECK_SIZE),
    Schema.isMaxLength(DECK_SIZE),
    Schema.isUnique()
  )
  .pipe(Schema.brand("Deck"));

export type Deck = typeof DeckSchema.Type;
