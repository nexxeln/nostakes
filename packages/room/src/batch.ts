import { Result } from "effect";

import type { Decision } from "./decision.js";
import { evolveAll } from "./evolve.js";
import { isOpen } from "./state.js";
import type { Open } from "./state.js";

export const andThen = (
  state: Open,
  first: Decision,
  next: (after: Open) => Decision
): Decision =>
  first.pipe(
    Result.flatMap((events) => {
      const after = evolveAll(state, events);

      return isOpen(after)
        ? Result.map(next(after), (more) => [...events, ...more])
        : Result.succeed(events);
    })
  );
