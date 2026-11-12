import { it } from "@effect/vitest";

import { SMALLEST_TALL, SMALLEST_WIDE } from "./layout/lane-checks.js";
import {
  FULLEST_TABLES,
  grid,
  once,
  steps,
  swept,
  WIDEST_AMOUNT,
} from "./layout/sweep.js";

const SHORTEST = grid(
  steps(SMALLEST_TALL.width, SMALLEST_WIDE.width - 1, 2),
  steps(SMALLEST_TALL.height, SMALLEST_TALL.height + 12, 2)
);

const NARROWEST = grid(
  steps(SMALLEST_TALL.width, SMALLEST_TALL.width + 70, 2),
  steps(SMALLEST_TALL.height, 1000, 20)
);

it.live(
  "eight and nine seats hold on every second pixel of the shortest and the narrowest tall tables",
  () =>
    swept(
      "tall edges",
      once([...SHORTEST, ...NARROWEST]),
      FULLEST_TABLES,
      WIDEST_AMOUNT
    )
);
