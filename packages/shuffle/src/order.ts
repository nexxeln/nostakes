import { uint32 } from "./bytes.js";
import { taggedHash } from "./hashing.js";
import { DECK_SIZE, DeckSlotSchema, PositionSchema } from "./schemas.js";
import type { DeckSlot, Position, Seed } from "./schemas.js";

const WORD_RANGE = 2 ** 32;

const WORDS_PER_BLOCK = 8;

export type Draw = (choices: number) => number;

const wordsOf = (block: Uint8Array) => {
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);

  return Array.from({ length: WORDS_PER_BLOCK }, (_, index) =>
    view.getUint32(index * 4)
  );
};

export const drawsFrom = (seed: Uint8Array): Draw => {
  let block = 0;
  let words: readonly number[] = [];
  let next = 0;

  const nextWord = () => {
    if (next === words.length) {
      words = wordsOf(taggedHash("stream", [seed, uint32(block)]));
      block += 1;
      next = 0;
    }

    const word = words[next] ?? 0;

    next += 1;

    return word;
  };

  return (choices) => {
    const fair = WORD_RANGE - (WORD_RANGE % choices);
    let word = nextWord();

    while (word >= fair) {
      word = nextWord();
    }

    return word % choices;
  };
};

export const shuffledIndices = (size: number, draw: Draw): number[] => {
  const items = Array.from({ length: size }, (_, index) => index);

  for (let top = size - 1; top > 0; top -= 1) {
    const pick = draw(top + 1);
    const held = items[top] ?? top;

    items[top] = items[pick] ?? pick;
    items[pick] = held;
  }

  return items;
};

export interface DealingPlan {
  readonly dealtSlot: DeckSlot;
  readonly spareSlot: DeckSlot;
  readonly order: readonly Position[];
}

export const dealingPlan = (seed: Seed): DealingPlan => {
  const draw = drawsFrom(seed);
  const dealtSlot = DeckSlotSchema.make(draw(2) === 0 ? 0 : 1);

  return {
    dealtSlot,
    order: shuffledIndices(DECK_SIZE, draw).map((position) =>
      PositionSchema.make(position)
    ),
    spareSlot: dealtSlot === 0 ? 1 : 0,
  };
};
