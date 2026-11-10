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

const covers = (a: Box, b: Box) =>
  Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) &&
  Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

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
    ({ table: { height, others, runs, width } }) => {
      const geo = computeGeo(width, height, others);
      const lanes = runLanes(geo, runs);
      const drawn = runLanesBox(lanes);
      const yours = tableObstacles(geo).slice(geo.seats.length);

      expect({
        coversYours: yours.some((box) => covers(drawn, box)),
        lanes: lanes.length,
        onTable:
          drawn.x >= 0 &&
          drawn.y >= geo.top &&
          drawn.x + drawn.w <= width &&
          drawn.y + drawn.h <= height,
      }).toStrictEqual({ coversYours: false, lanes: runs, onTable: true });
    }
  );
});
