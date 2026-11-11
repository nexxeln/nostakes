import type { Avatar, Expression, PlacedPart, Suit } from "./avatar.js";
import { browsFor, eyesFor, mouthFor } from "./features.js";
import { marksFor } from "./marks.js";
import { cut, flat, ofPart, pip, raised, shifted, turned } from "./sheets.js";
import type { Piece } from "./sheets.js";
import type { Build } from "./species.js";
import {
  extraFor,
  eyewearFor,
  glassesHideEyes,
  headwearFor,
  neckwearFor,
} from "./wardrobe.js";

const heldCard = (left: number, turn: number, suit: Suit): readonly Piece[] =>
  turned(
    [
      cut(
        [
          [left, 70],
          [left + 17, 70],
          [left + 17, 95],
          [left, 95],
        ],
        "Stock"
      ),
      flat(
        [
          [left + 2.4, 72.4],
          [left + 14.6, 72.4],
          [left + 14.6, 92.6],
          [left + 2.4, 92.6],
        ],
        "Ink"
      ),
      pip(suit, [left + 8.5, 82.5], 6, "Stock"),
    ],
    turn,
    [left + 8.5 - turn * 0.1, 84]
  );

const heldCards = (suit: Suit): readonly Piece[] => [
  ...heldCard(33, -12, suit),
  ...heldCard(50, 10, suit),
];

interface Mood {
  readonly rise: number;
  readonly dy: number;
}

const MOODS: Partial<Record<Expression, Mood>> = {
  Gutted: { dy: 1.2, rise: 0.7 },
  Happy: { dy: -1.6, rise: 1.45 },
};

const STILL: Mood = { dy: 0, rise: 1 };

const moved = (pieces: readonly Piece[], mood: Mood): readonly Piece[] =>
  raised(shifted(pieces, 0, mood.dy), mood.rise);

const shadesDown = (avatar: Avatar, expression: Expression) =>
  avatar.eyewear === "Shades" && expression === "LookingDown";

export const layersOf = (
  avatar: Avatar,
  expression: Expression,
  build: Build,
  uncovered?: PlacedPart
): readonly (readonly Piece[])[] => {
  const hat = headwearFor(avatar.headwear, build.hat, avatar.suit);
  const mood = MOODS[expression] ?? STILL;

  const eyes =
    glassesHideEyes(avatar.eyewear, expression) && uncovered !== "eyes"
      ? []
      : eyesFor(
          avatar.eyes,
          avatar.suit,
          shadesDown(avatar, expression) ? "Resting" : expression,
          build.eyes
        );

  const brows = shadesDown(avatar, expression)
    ? []
    : browsFor(expression, build.eyes, build.brows);

  return [
    build.behind(avatar.rank, avatar.suit),
    ofPart(hat.behind, "headwear"),
    build.body,
    ofPart(marksFor(avatar, build), "mark"),
    build.front(avatar.rank, avatar.suit),
    ofPart(moved(eyes, mood), "eyes"),
    moved(brows, mood),
    ofPart(
      moved(
        eyewearFor(
          avatar.eyewear,
          expression,
          build.eyes,
          build.glasses,
          build.hat.y - 1
        ),
        mood
      ),
      "eyewear"
    ),
    ofPart(
      moved(mouthFor(avatar.mouth, expression, build.mouth), mood),
      "mouth"
    ),
    ofPart(neckwearFor(avatar.neck, avatar.suit, build.neck), "neck"),
    ofPart(moved(hat.front, mood), "headwear"),
    ofPart(
      moved(extraFor(avatar.extra, expression, build.mouth), mood),
      "extra"
    ),
    expression === "LookingDown" ? heldCards(avatar.suit) : [],
  ];
};
