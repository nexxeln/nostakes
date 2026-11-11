import { expect, it } from "@effect/vitest";
import { Console, Effect } from "effect";

import { computeGeo } from "../src/client/table/layout.js";
import {
  everyoneBetting,
  fallbackOf,
  flightsOverTheHint,
  hintPlaced,
  laneProblemsOn,
  SHORTEST_WIDE,
  SMALLEST_TALL,
  SMALLEST_WIDE,
  supports,
} from "./layout/lane-checks.js";
import type { Screen } from "./layout/lane-checks.js";

const OTHERS = [1, 2, 3, 4, 5, 6, 7, 8];

const AMOUNTS = [9, 99, 999, 9999];

const steps = (from: number, to: number, step: number) =>
  Array.from(
    { length: Math.floor((to - from) / step) + 1 },
    (__, at) => from + at * step
  );

const grid = (
  widths: readonly number[],
  heights: readonly number[]
): readonly Screen[] =>
  widths.flatMap((width) => heights.map((height) => ({ height, width })));

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

const lanesOn = (screen: Screen, others: number, sample: number) => {
  const most = AMOUNTS[sample % AMOUNTS.length] ?? 9999;
  const geo = computeGeo(screen.width, screen.height, others, most);
  const button = sample % (others + 1);
  const table = everyoneBetting(screen, others, button, sample % 2 === 0);
  const hint = hintPlaced(geo, screen);
  const where = `${screen.width}x${screen.height}, ${others + 1} seats, up to ${most}, button ${button}`;

  return [
    ...laneProblemsOn({ ...table, most }, geo),
    ...flightsOverTheHint(geo),
    ...Object.entries(hint).flatMap(([part, well]) =>
      well ? [] : [`the hint's ${part} is not placed well`]
    ),
  ].map((problem) => `${where}: ${problem}`);
};

const fallbackOn = (screen: Screen, others: number) => {
  const fallback = fallbackOf(screen, others, 99_999);

  return fallback.facesAtLeastTheFloor && fallback.saysWhenLanesDoNotFit
    ? []
    : [
        `${screen.width}x${screen.height}, ${others + 1} seats: ${JSON.stringify(fallback)}`,
      ];
};

it.live(
  "every lane, the hint, the chips flying past it, and the fallback hold on a grid of every table the app supports and below it",
  () =>
    Effect.gen(function* sweep() {
      const started = performance.now();

      const lanes = SUPPORTED.flatMap((screen, at) =>
        OTHERS.flatMap((others) => lanesOn(screen, others, at + others))
      );

      const fallbacks = TOO_SMALL.flatMap((screen) =>
        OTHERS.flatMap((others) => fallbackOn(screen, others))
      );

      yield* Console.log(
        `layout sweep: ${SUPPORTED.length * OTHERS.length} supported tables, ${TOO_SMALL.length * OTHERS.length} below the range, ${lanes.length + fallbacks.length} problems, ${Math.round(performance.now() - started)} ms`
      );

      expect([...lanes, ...fallbacks].slice(0, 40)).toStrictEqual([]);
    })
);
