import { SMALLEST_WIDE } from "./layout/lane-checks.js";
import {
  FULLEST_TABLES,
  grid,
  once,
  steps,
  sweptWithEveryDeal,
  WIDEST_AMOUNT,
  YOUR_ARCS_UNDER_A_GROWN_CAPTION,
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

sweptWithEveryDeal(
  "eight and nine seats hold on the shortest wide tables and where a tall table turns wide",
  "wide edges",
  once([...SHORTEST, ...WHERE_TALL_TURNS_WIDE]),
  FULLEST_TABLES,
  WIDEST_AMOUNT
);

for (const band of YOUR_ARCS_UNDER_A_GROWN_CAPTION) {
  sweptWithEveryDeal(
    `your speaking arcs keep clear of a neighbour's caption as it grows on its turn, on the band from ${band.screens[0]?.width}x${band.screens[0]?.height}`,
    "where your arcs met a grown caption",
    band.screens,
    band.seatings,
    WIDEST_AMOUNT
  );
}
