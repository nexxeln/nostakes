import { expect, it } from "@effect/vitest";
import { Console, Effect } from "effect";

import { computeGeo } from "../../src/client/table/layout.js";
import type { BoardRows } from "../../src/client/table/layout.js";
import {
  buttonsMisplaced,
  entryPlaced,
  everyoneBetting,
  feltRulesPlaced,
  flightsOverTheHint,
  handPlaced,
  hintPlaced,
  laneProblemsOn,
} from "./lane-checks.js";
import type { Screen } from "./lane-checks.js";

export const EVERY_TABLE = [1, 2, 3, 4, 5, 6, 7, 8];

export const FULLEST_TABLES = [7, 8];

export const EVERY_AMOUNT = [9, 99, 999, 9999];

export const WIDEST_AMOUNT = [9999];

export const HOLE_CARDS = [2, 4];

export interface Dealt {
  readonly boards: BoardRows;
  readonly hole: number;
}

export const ONE_BOARD_OR_FOUR_CARDS: readonly Dealt[] = [
  { boards: 1, hole: 2 },
  { boards: 2, hole: 2 },
  { boards: 1, hole: 4 },
];

export const EVERY_DEAL: readonly Dealt[] = [
  ...ONE_BOARD_OR_FOUR_CARDS,
  { boards: 2, hole: 4 },
];

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

const dealtAs = ({ boards, hole }: Dealt) =>
  `${boards === 1 ? "one board" : "a double board"} and ${hole} hole cards`;

const problemsOn = (
  screen: Screen,
  others: number,
  sample: number,
  amounts: readonly number[],
  { boards, hole }: Dealt
) => {
  const most = amounts[sample % amounts.length] ?? 9999;

  const geo = computeGeo(
    screen.width,
    screen.height,
    others,
    most,
    boards,
    hole
  );

  const button = sample % (others + 1);

  const table = everyoneBetting(screen, others, button, sample % 2 === 0, hole);

  const hint = hintPlaced(geo, screen);
  const where = `${screen.width}x${screen.height}, ${others + 1} seats, ${boards} board${boards === 1 ? "" : "s"}, ${hole} hole cards, up to ${most}, button ${button}`;

  return [
    ...laneProblemsOn({ ...table, most }, geo),
    ...buttonsMisplaced(geo, screen),
    ...flightsOverTheHint(geo),
    ...Object.entries(hint).flatMap(([part, well]) =>
      well ? [] : [`the hint's ${part} is not placed well`]
    ),
    ...Object.entries(handPlaced(geo, screen)).flatMap(([part, well]) =>
      well ? [] : [`your cards fail ${part}`]
    ),
    ...Object.entries(feltRulesPlaced(geo, screen)).flatMap(([part, well]) =>
      well ? [] : [`the rules on the felt fail ${part}`]
    ),
    ...Object.entries(entryPlaced(geo, screen)).flatMap(([part, well]) =>
      well ? [] : [`the posting card fails ${part}`]
    ),
  ].map((problem) => `${where}: ${problem}`);
};

const swept = (
  name: string,
  screens: readonly Screen[],
  seatings: readonly number[],
  amounts: readonly number[],
  dealt: Dealt
) =>
  Effect.gen(function* sweep() {
    const started = performance.now();

    const found = screens.flatMap((screen, at) =>
      seatings.flatMap((others) => {
        const problems = problemsOn(
          screen,
          others,
          at + others,
          amounts,
          dealt
        );

        return problems.length === 0 ? [] : [problems];
      })
    );

    yield* Console.log(
      `layout sweep, ${name}, ${dealtAs(dealt)}: ${screens.length * seatings.length} tables, ${found.length} with problems, ${Math.round(performance.now() - started)} ms`
    );

    expect(
      found.flatMap((problems) => problems.slice(0, 2)).slice(0, 40)
    ).toStrictEqual([]);
  });

export const sweptWithEveryDeal = (
  holds: string,
  name: string,
  screens: readonly Screen[],
  seatings: readonly number[],
  amounts: readonly number[],
  deals: readonly Dealt[] = ONE_BOARD_OR_FOUR_CARDS
) => {
  for (const dealt of deals) {
    it.live(`${holds}, with ${dealtAs(dealt)}`, () =>
      swept(name, screens, seatings, amounts, dealt)
    );
  }
};
