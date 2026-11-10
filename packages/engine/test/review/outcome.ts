import { Result } from "effect";

import { decide } from "../../src/index.js";
import type { Command, TableState } from "../../src/index.js";

export const outcomeOf = (state: TableState, command: Command) => {
  try {
    return Result.match(decide(state, command), {
      onFailure: (rejection) => `rejected ${rejection._tag}`,
      onSuccess: (events) =>
        `accepted ${events.map((event) => event._tag).join(" ")}`,
    });
  } catch (error) {
    return `threw ${String(error)}`;
  }
};

export const kindOf = (outcome: string) => outcome.split(" ")[0];
