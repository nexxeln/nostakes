import { it } from "@effect/vitest";

import { SHORTEST_WIDE, SMALLEST_WIDE } from "./layout/lane-checks.js";
import {
  FULLEST_TABLES,
  grid,
  once,
  steps,
  swept,
  WIDEST_AMOUNT,
} from "./layout/sweep.js";

const BELOW_WIDE = SMALLEST_WIDE.height - 1;

const EVERY_WIDTH = grid(
  steps(SHORTEST_WIDE.width, 1440, 4),
  steps(SHORTEST_WIDE.height, BELOW_WIDE, 3)
);

const NARROWEST = grid(
  steps(SHORTEST_WIDE.width, SHORTEST_WIDE.width + 70, 2),
  steps(SHORTEST_WIDE.height, BELOW_WIDE, 1)
);

it.live(
  "eight and nine seats hold on the short wide tables, every pixel of height at the narrowest",
  () =>
    swept(
      "short wide",
      once([...EVERY_WIDTH, ...NARROWEST]),
      FULLEST_TABLES,
      WIDEST_AMOUNT
    )
);
