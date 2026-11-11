import { beatOf, handOf } from "./lesson.js";
import type { Beat, Lesson, Move } from "./lesson.js";
import { afterMoves, DEALT } from "./table.js";
import type { Table } from "./table.js";

export interface Step {
  readonly beat: string;
  readonly choice: number;
}

export interface Walk {
  readonly at: string;
  readonly before: readonly Walk[];
  readonly steps: readonly Step[];
}

export const begin = (lesson: Lesson): Walk => ({
  at: lesson.start,
  before: [],
  steps: [],
});

export const here = (lesson: Lesson, walk: Walk): Beat | undefined =>
  beatOf(lesson, walk.at);

export const choose = (lesson: Lesson, walk: Walk, index: number): Walk => {
  const from = here(lesson, walk);
  const to = from?.choices[index]?.to;
  const next = to === undefined ? undefined : beatOf(lesson, to);

  if (from === undefined || next === undefined) {
    return walk;
  }

  return {
    at: next.id,
    before: [...walk.before, walk],
    steps:
      next.hand === from.hand
        ? [...walk.steps, { beat: from.id, choice: index }]
        : [],
  };
};

export const skip = (lesson: Lesson, walk: Walk) => choose(lesson, walk, 0);

export const back = (walk: Walk): Walk => walk.before.at(-1) ?? walk;

export const jump = (lesson: Lesson, walk: Walk, hand: string): Walk => {
  const first = handOf(lesson, hand)?.first;

  return first === undefined || first === walk.at
    ? walk
    : { at: first, before: [...walk.before, walk], steps: [] };
};

export const handNumber = (lesson: Lesson, walk: Walk) => {
  const beat = here(lesson, walk);

  if (beat?.kind === "Recap") {
    return lesson.hands.length + 1;
  }

  return lesson.hands.findIndex((hand) => hand.id === beat?.hand) + 1;
};

const movesOf = (lesson: Lesson, step: Step): readonly Move[] => {
  const beat = beatOf(lesson, step.beat);

  return [...(beat?.moves ?? []), ...(beat?.choices[step.choice]?.moves ?? [])];
};

const chosenLast = (lesson: Lesson, walk: Walk): readonly Move[] => {
  const last = walk.steps.at(-1);

  return last === undefined
    ? []
    : (beatOf(lesson, last.beat)?.choices[last.choice]?.moves ?? []);
};

const playedFor = (lesson: Lesson, walk: Walk): readonly Move[] => {
  const beat = here(lesson, walk);

  return beat === undefined ? [] : (handOf(lesson, beat.hand)?.played ?? []);
};

export const arrival = (lesson: Lesson, walk: Walk): readonly Move[] => [
  ...(walk.steps.length === 0 ? playedFor(lesson, walk) : []),
  ...chosenLast(lesson, walk),
  ...(here(lesson, walk)?.moves ?? []),
];

export const tableBefore = (lesson: Lesson, walk: Walk): Table => {
  const last = walk.steps.at(-1);

  if (last === undefined) {
    return DEALT;
  }

  return afterMoves(DEALT, [
    ...playedFor(lesson, walk),
    ...walk.steps.slice(0, -1).flatMap((step) => movesOf(lesson, step)),
    ...(beatOf(lesson, last.beat)?.moves ?? []),
  ]);
};

export const tableAt = (lesson: Lesson, walk: Walk): Table =>
  afterMoves(tableBefore(lesson, walk), arrival(lesson, walk));
