import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  computeGeo,
  runLanes,
  runLanesBox,
  tableObstacles,
} from "../src/client/table/layout.js";
import type { Box } from "../src/client/table/layout.js";

const VISIBLE_PX = 1;

const covers = (a: Box, b: Box) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) >= VISIBLE_PX &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) >= VISIBLE_PX;

interface Table {
  readonly height: number;
  readonly others: number;
  readonly runs: number;
  readonly width: number;
}

const placed = ({ height, others, runs, width }: Table) => {
  const geo = computeGeo(width, height, others);
  const lanes = runLanes(geo, runs);
  const drawn = runLanesBox(lanes);
  const yours = tableObstacles(geo).slice(geo.seats.length);

  return {
    coversYours: yours.some((box) => covers(drawn, box)),
    lanes: lanes.length,
    onTable:
      drawn.x > -VISIBLE_PX &&
      drawn.y > geo.top - VISIBLE_PX &&
      drawn.x + drawn.w < width + VISIBLE_PX &&
      drawn.y + drawn.h < height + VISIBLE_PX,
  };
};

const PLACED_WELL = (runs: number) => ({
  coversYours: false,
  lanes: runs,
  onTable: true,
});

const FOUND_BEFORE: readonly Table[] = [
  { height: 423, others: 8, runs: 1, width: 564 },
  { height: 524, others: 5, runs: 2, width: 563 },
  { height: 315, others: 5, runs: 2, width: 568 },
  { height: 524, others: 1, runs: 1, width: 626 },
];

const between = (minimum: number, maximum: number) =>
  Schema.Int.check(Schema.isBetween({ maximum, minimum }));

const seated = {
  others: between(1, 8),
  runs: between(1, 2),
};

const tables = Arbitrary.schema(
  Schema.Union([
    Schema.Struct({
      ...seated,
      height: between(520, 1000),
      width: between(360, 559),
    }),
    Schema.Struct({
      ...seated,
      height: between(300, 1000),
      width: between(560, 1280),
    }),
  ])
);

describe("extra boards from running it more than once", () => {
  it.prop(
    "never cover your face, your cards, the chip, or the first board, and stay on a phone's table",
    { table: tables },
    ({ table }) => {
      expect(placed(table)).toStrictEqual(PLACED_WELL(table.runs));
    }
  );

  it("places the tables that once broke it", () => {
    expect(FOUND_BEFORE.map(placed)).toStrictEqual(
      FOUND_BEFORE.map(({ runs }) => PLACED_WELL(runs))
    );
  });
});
