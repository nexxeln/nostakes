import { Result } from "effect";

import type { Decision } from "./decision.js";
import { evolveToDecide } from "./evolve.js";
import { isOpen } from "./state.js";
import type { Open } from "./state.js";

export const andThen = (
  state: Open,
  first: Decision,
  next: (after: Open) => Decision
): Decision =>
  first.pipe(
    Result.flatMap((events) => {
      const after = evolveToDecide(state, events);

      return isOpen(after)
        ? Result.map(next(after), (more) => [...events, ...more])
        : Result.succeed(events);
    })
  );

export type Step = (state: Open) => Decision;

export const inSequence = (state: Open, steps: readonly Step[]): Decision => {
  const [first, ...rest] = steps;

  return first === undefined
    ? Result.succeed([])
    : andThen(state, first(state), (after) => inSequence(after, rest));
};
