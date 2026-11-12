import { expect } from "@effect/vitest";
import { Console, Effect } from "effect";

import { computeGeo } from "../../src/client/table/layout.js";
import {
  buttonsMisplaced,
  everyoneBetting,
  feltRulesPlaced,
  flightsOverTheHint,
  hintPlaced,
  laneProblemsOn,
} from "./lane-checks.js";
import type { Screen } from "./lane-checks.js";

export const EVERY_TABLE = [1, 2, 3, 4, 5, 6, 7, 8];

export const FULLEST_TABLES = [7, 8];

export const EVERY_AMOUNT = [9, 99, 999, 9999];

export const WIDEST_AMOUNT = [9999];

export const steps = (from: number, to: number, step: number) =>
  Array.from(
    { length: Math.floor((to - from) / step) + 1 },
    (__, at) => from + at * step
  );

export const grid = (
  widths: readonly number[],
  heights: readonly number[]
): readonly Screen[] =>
  widths.flatMap((width) => heights.map((height) => ({ height, width })));

export const once = (screens: readonly Screen[]): readonly Screen[] => [
  ...new Map(
    screens.map((screen) => [`${screen.width}x${screen.height}`, screen])
  ).values(),
];

const problemsOn = (
  screen: Screen,
  others: number,
  sample: number,
  amounts: readonly number[]
) => {
  const most = amounts[sample % amounts.length] ?? 9999;
  const geo = computeGeo(screen.width, screen.height, others, most);
  const button = sample % (others + 1);
  const table = everyoneBetting(screen, others, button, sample % 2 === 0);
  const hint = hintPlaced(geo, screen);
  const where = `${screen.width}x${screen.height}, ${others + 1} seats, up to ${most}, button ${button}`;

  return [
    ...laneProblemsOn({ ...table, most }, geo),
    ...buttonsMisplaced(geo, screen),
    ...flightsOverTheHint(geo),
    ...Object.entries(hint).flatMap(([part, well]) =>
      well ? [] : [`the hint's ${part} is not placed well`]
    ),
    ...Object.entries(feltRulesPlaced(geo, screen)).flatMap(([part, well]) =>
      well ? [] : [`the rules on the felt fail ${part}`]
    ),
  ].map((problem) => `${where}: ${problem}`);
};

export const swept = (
  name: string,
  screens: readonly Screen[],
  seatings: readonly number[],
  amounts: readonly number[]
) =>
  Effect.gen(function* sweep() {
    const started = performance.now();

    const found = screens.flatMap((screen, at) =>
      seatings.flatMap((others) => {
        const problems = problemsOn(screen, others, at + others, amounts);

        return problems.length === 0 ? [] : [problems];
      })
    );

    yield* Console.log(
      `layout sweep, ${name}: ${screens.length * seatings.length} tables, ${found.length} with problems, ${Math.round(performance.now() - started)} ms`
    );

    expect(
      found.flatMap((problems) => problems.slice(0, 2)).slice(0, 40)
    ).toStrictEqual([]);
  });
