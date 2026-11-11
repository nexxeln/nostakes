export const SUIT_PATHS = {
  c: "M50 8A21 21 0 1 1 49.9 8ZM29 38A21 21 0 1 1 28.9 38ZM71 38A21 21 0 1 1 70.9 38ZM45 56C45 78 38 90 28 96L72 96C62 90 55 78 55 56Z",
  d: "M50 2C58 20 72 38 88 50C72 62 58 80 50 98C42 80 28 62 12 50C28 38 42 20 50 2Z",
  h: "M50 94C40 80 6 60 6 32C6 14 20 5 33 6C42 7 48 14 50 22C52 14 58 7 67 6C80 5 94 14 94 32C94 60 60 80 50 94Z",
  s: "M50 4C42 20 8 36 8 60C8 78 30 86 45 72C43 84 37 92 28 96L72 96C63 92 57 84 55 72C70 86 92 78 92 60C92 36 58 20 50 4Z",
} as const;

export type SuitLetter = keyof typeof SUIT_PATHS;

export const isSuitLetter = (letter: string): letter is SuitLetter =>
  Object.hasOwn(SUIT_PATHS, letter);

export const CARD_HEIGHT = 140;

export const INDEX_SIZE = 46;

const RANK_LABELS = {
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  A: "A",
  J: "J",
  K: "K",
  Q: "Q",
  T: "10",
} as const;

export type RankLetter = keyof typeof RANK_LABELS;

const isRankLetter = (letter: string): letter is RankLetter =>
  Object.hasOwn(RANK_LABELS, letter);

export interface CardFace {
  readonly rank: RankLetter;
  readonly suit: SuitLetter;
}

export const cardFaceOf = (card: string): CardFace | undefined => {
  const rank = card.charAt(0);
  const suit = card.charAt(1);

  return card.length === 2 && isRankLetter(rank) && isSuitLetter(suit)
    ? { rank, suit }
    : undefined;
};

const pip = (suit: SuitLetter, x: number, y: number, size: number) =>
  `<path d="${SUIT_PATHS[suit]}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})"/>`;

export const cardFaceMarks = ({ rank, suit }: CardFace) => {
  const label = RANK_LABELS[rank];

  return `<text x="12" y="50" font-size="${INDEX_SIZE}"${label.length > 1 ? ` letter-spacing="${-INDEX_SIZE * 0.09}"` : ""}>${label}</text>${pip(suit, 24, 70, 24)}${pip(suit, 64, CARD_HEIGHT * 0.73, 50)}`;
};
