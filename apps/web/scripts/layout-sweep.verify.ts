import { expect, it } from "@effect/vitest";
import { Console, Effect } from "effect";

import {
  fallbackOf,
  SHORTEST_WIDE,
  SMALLEST_TALL,
  SMALLEST_WIDE,
  supports,
} from "./layout/lane-checks.js";
import type { Screen } from "./layout/lane-checks.js";
import {
  EVERY_AMOUNT,
  EVERY_TABLE,
  grid,
  steps,
  swept,
} from "./layout/sweep.js";

const SUPPORTED: readonly Screen[] = [
  ...grid(
    steps(SMALLEST_TALL.width, SMALLEST_WIDE.width - 1, 20),
    steps(SMALLEST_TALL.height, 1000, 40)
  ),
  ...grid(
    steps(SMALLEST_WIDE.width, 1440, 40),
    steps(SMALLEST_WIDE.height, 1000, 40)
  ),
  ...grid(
    steps(SHORTEST_WIDE.width, 1440, 40),
    steps(SHORTEST_WIDE.height, SMALLEST_WIDE.height - 1, 10)
  ),
];

const TOO_SMALL: readonly Screen[] = grid(
  steps(300, 1440, 60),
  steps(240, 1000, 40)
).filter((screen) => !supports(screen));

const fallbackOn = (screen: Screen, others: number) => {
  const fallback = fallbackOf(screen, others, 99_999);

  return fallback.facesAtLeastTheFloor && fallback.saysWhenLanesDoNotFit
    ? []
    : [
        `${screen.width}x${screen.height}, ${others + 1} seats: ${JSON.stringify(fallback)}`,
      ];
};

it.live(
  "every lane, the button, the hint, the rules on the felt, and the chips flying past it hold with two to nine seats on a grid of every table the app supports",
  () => swept("every seat count", SUPPORTED, EVERY_TABLE, EVERY_AMOUNT)
);

it.live(
  "a table below the range keeps faces at the floor and says when its lanes do not fit",
  () =>
    Effect.gen(function* sweep() {
      const fallbacks = TOO_SMALL.flatMap((screen) =>
        EVERY_TABLE.flatMap((others) => fallbackOn(screen, others))
      );

      yield* Console.log(
        `layout sweep, below the range: ${TOO_SMALL.length * EVERY_TABLE.length} tables, ${fallbacks.length} problems`
      );

      expect(fallbacks.slice(0, 40)).toStrictEqual([]);
    })
);
