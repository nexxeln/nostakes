import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  buttonBox,
  buttonGround,
  buttonSpots,
  computeGeo,
  POST_TAG_WIDTHS,
  postTagBox,
  postTagGround,
  postTagSides,
  runLanes,
  runLanesBox,
  tableObstacles,
} from "../src/client/table/layout.js";
import type { Box, ButtonSpot, Pt } from "../src/client/table/layout.js";

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

interface Seating {
  readonly height: number;
  readonly others: number;
  readonly width: number;
}

const NAME_DEPTH = 46;

const gapToBox = (point: Pt, box: Box) =>
  Math.hypot(
    Math.max(box.x - point.x, 0, point.x - box.x - box.w),
    Math.max(box.y - point.y, 0, point.y - box.y - box.h)
  );

const seatGap = (point: Pt, centre: Pt, size: number) =>
  Math.min(
    gapToBox(point, {
      h: size,
      w: size,
      x: centre.x - size / 2,
      y: centre.y - size / 2,
    }),
    gapToBox(point, {
      h: NAME_DEPTH,
      w: size * 1.3,
      x: centre.x - size * 0.65,
      y: centre.y + size / 2,
    })
  );

const buttonsOf = ({ height, others, width }: Seating) => {
  const geo = computeGeo(width, height, others);
  const spots = buttonSpots(geo);
  const grounds = buttonGround(geo);

  const faces = [
    ...geo.seats.map(({ x, y }) => ({ centre: { x, y }, size: geo.tile })),
    { centre: geo.self, size: geo.self.size },
  ];

  const judged = (spot: ButtonSpot, owner: number) => {
    const box = buttonBox(spot);
    const gaps = faces.map(({ centre, size }) => seatGap(spot, centre, size));
    const own = gaps[owner] ?? Infinity;

    const ground = grounds[owner] ?? {
      others: [],
      own: [],
      ownSeat: [],
      tags: [],
      untouchable: [],
    };

    return {
      coversAnotherSeatOrTheMiddle: ground.untouchable.some((other) =>
        covers(box, other)
      ),
      nearestIsOwner: gaps.every((gap, index) => index === owner || gap > own),
      onTable:
        box.x > -VISIBLE_PX &&
        box.y > geo.top - VISIBLE_PX &&
        box.x + box.w < width + VISIBLE_PX &&
        box.y + box.h < height + VISIBLE_PX,
    };
  };

  return {
    onTheFelt: [...spots.seats, spots.self].filter((spot, owner) =>
      [
        ...(grounds[owner]?.ownSeat ?? []),
        ...(grounds[owner]?.others ?? []),
      ].every((mine) => !covers(buttonBox(spot), mine))
    ).length,
    placed: [...spots.seats, spots.self].map((spot, owner) =>
      judged(spot, owner)
    ),
    seats: others + 1,
  };
};

const BUTTON_PLACED_WELL = {
  coversAnotherSeatOrTheMiddle: false,
  nearestIsOwner: true,
  onTable: true,
};

const SCREENS_WE_SHOOT: readonly Seating[] = [1, 5, 8].flatMap((others) =>
  [
    { height: 592, width: 360 },
    { height: 796, width: 390 },
    { height: 852, width: 1440 },
    { height: 342, width: 844 },
  ].map((screen) => ({ ...screen, others }))
);

const seatings = Arbitrary.schema(
  Schema.Union([
    Schema.Struct({
      height: between(520, 1000),
      others: seated.others,
      width: between(360, 559),
    }),
    Schema.Struct({
      height: between(300, 1000),
      others: seated.others,
      width: between(560, 1440),
    }),
  ])
);

describe("the dealer button", () => {
  it.prop(
    "lies on the table nearer its own face and name than any other, and never covers another seat's face or name, a bet, the board, your cards, or the chip, unless that already lies on its own seat",
    { seating: seatings },
    ({ seating }) => {
      const spots = buttonsOf(seating).placed;

      expect(spots).toStrictEqual(spots.map(() => BUTTON_PLACED_WELL));
    }
  );

  it("lies on the felt clear of its own face and name and of every other seat's face, ring, and name on the screens we photograph", () => {
    const found = SCREENS_WE_SHOOT.map(buttonsOf);

    expect(found.map(({ onTheFelt }) => onTheFelt)).toStrictEqual(
      found.map(({ seats }) => seats)
    );
  });
});

const CROWDED_SCREENS: readonly Seating[] = [5, 8].flatMap((others) =>
  [
    { height: 592, width: 360 },
    { height: 796, width: 390 },
    { height: 852, width: 1440 },
  ].map((screen) => ({ ...screen, others }))
);

const tagsCoveringAnotherSeat = ({ height, others, width }: Seating) => {
  const geo = computeGeo(width, height, others);
  const piles = [...geo.seats.map(({ bet }) => bet), geo.heroBet];
  const grounds = postTagGround(geo);

  return Object.values(POST_TAG_WIDTHS).flatMap((tagWidth) => {
    const sides = postTagSides(geo, tagWidth);

    return piles.filter((pile, index) =>
      (grounds[index]?.others ?? []).some((other) =>
        covers(postTagBox(pile, sides[index] ?? "Before", tagWidth), other)
      )
    );
  }).length;
};

describe("the tag on a posted blind", () => {
  it("covers no other seat's face or name, no other bet, the board, your cards, or the chip at six and nine seats", () => {
    expect(CROWDED_SCREENS.map(tagsCoveringAnotherSeat)).toStrictEqual(
      CROWDED_SCREENS.map(() => 0)
    );
  });
});
