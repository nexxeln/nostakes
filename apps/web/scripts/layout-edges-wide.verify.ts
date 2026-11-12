import { it } from "@effect/vitest";

import { SMALLEST_WIDE } from "./layout/lane-checks.js";
import {
  FULLEST_TABLES,
  grid,
  once,
  steps,
  swept,
  WIDEST_AMOUNT,
} from "./layout/sweep.js";

const SHORTEST = grid(
  steps(SMALLEST_WIDE.width, 1440, 4),
  steps(SMALLEST_WIDE.height, SMALLEST_WIDE.height + 12, 2)
);

const WIDE_OVER_TALL = 1.08;

const WHERE_TALL_TURNS_WIDE = steps(600, 1000, 8).flatMap((height) =>
  steps(-6, 6, 2).map((off) => ({
    height,
    width: Math.round(height * WIDE_OVER_TALL) + off,
  }))
);

it.live(
  "eight and nine seats hold on the shortest wide tables and where a tall table turns wide",
  () =>
    swept(
      "wide edges",
      once([...SHORTEST, ...WHERE_TALL_TURNS_WIDE]),
      FULLEST_TABLES,
      WIDEST_AMOUNT
    )
);
