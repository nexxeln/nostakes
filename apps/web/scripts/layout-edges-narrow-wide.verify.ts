import { it } from "@effect/vitest";

import { SMALLEST_WIDE } from "./layout/lane-checks.js";
import {
  FULLEST_TABLES,
  grid,
  steps,
  swept,
  WIDEST_AMOUNT,
} from "./layout/sweep.js";

const CARDS_FULL_SIZE_FROM = 450;

const NARROWEST = grid(
  steps(SMALLEST_WIDE.width, SMALLEST_WIDE.width + 70, 2),
  [
    ...steps(SMALLEST_WIDE.height, CARDS_FULL_SIZE_FROM, 2),
    ...steps(CARDS_FULL_SIZE_FROM + 10, 660, 10),
  ]
);

it.live(
  "eight and nine seats hold on every second pixel of the narrowest wide tables",
  () => swept("narrowest wide", NARROWEST, FULLEST_TABLES, WIDEST_AMOUNT)
);
