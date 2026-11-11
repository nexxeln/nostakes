import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  buttonBox,
  buttonGround,
  buttonSpots,
  computeGeo,
  handHint,
  handHintGround,
  HINT_LINES,
  pileBox,
  placeSeats,
  restingScale,
  POST_TAG_WIDTHS,
  potTabOf,
  postTagBox,
  postTagGround,
  postTagSides,
  runLanes,
  runLanesBox,
  seatBoxes,
  tableObstacles,
} from "../src/client/table/layout.js";
import type {
  Box,
  ButtonRide,
  ButtonSpot,
  ButtonSpots,
  Geo,
  Pt,
  SeatPlace,
} from "../src/client/table/layout.js";

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

const SEATS_AROUND_YOU = [1, 5, 8] as const;

const screens = Arbitrary.schema(
  Schema.Union([
    Schema.Struct({
      height: between(520, 1000),
      width: between(360, 559),
    }),
    Schema.Struct({
      height: between(300, 1000),
      width: between(560, 1440),
    }),
  ])
);

const hintPlaced = (width: number, height: number, others: number) => {
  const geo = computeGeo(width, height, others);
  const hint = handHint(geo);
  const tab = potTabOf(geo);

  const blocked = [
    ...handHintGround(geo),
    { h: tab.h, w: tab.w, x: tab.x - tab.w / 2, y: tab.y - tab.h / 2 },
  ];

  const clear = (box: Box) =>
    blocked.every((other) => !covers(box, other)) &&
    box.x > -VISIBLE_PX &&
    box.y > geo.top - VISIBLE_PX &&
    box.x + box.w < width + VISIBLE_PX &&
    box.y + box.h < height + VISIBLE_PX;

  return {
    firstLine: clear(hint.say),
    secondLine: clear(hint.foot),
    slipHoldsTheLongestLineInTwo:
      !hint.onCards || hint.say.w * 2 >= HINT_LINES.sayW,
  };
};

const HINT_PLACED_WELL = {
  firstLine: true,
  secondLine: true,
  slipHoldsTheLongestLineInTwo: true,
};

describe("the hint by your cards", () => {
  it.prop(
    "never covers the board, the pot, a face or a name, a bet, or the chip, in one line or two, with two, six, or nine seats",
    { screen: screens },
    ({ screen }) => {
      expect(
        SEATS_AROUND_YOU.map((others) =>
          hintPlaced(screen.width, screen.height, others)
        )
      ).toStrictEqual(SEATS_AROUND_YOU.map(() => HINT_PLACED_WELL));
    },
    { arbitrary: { runs: 300 } }
  );

  it("finds room on the screens we photograph and the smallest landscape phones", () => {
    const sizes = [
      { height: 592, width: 360 },
      { height: 796, width: 390 },
      { height: 852, width: 1440 },
      { height: 342, width: 844 },
      { height: 300, width: 560 },
      { height: 300, width: 667 },
    ];

    expect(
      sizes.flatMap(({ height, width }) =>
        SEATS_AROUND_YOU.map((others) => hintPlaced(width, height, others))
      )
    ).toStrictEqual(
      sizes.flatMap(() => SEATS_AROUND_YOU.map(() => HINT_PLACED_WELL))
    );
  });
});

const ActingSchema = Schema.Struct({
  bets: Schema.Array(between(0, 7)),
  button: between(0, 8),
  folded: Schema.Array(between(0, 7)),
  heroBet: Schema.Boolean,
  others: between(1, 8),
});

type Acting = typeof ActingSchema.Type;

const actings = Arbitrary.schema(ActingSchema);

interface Drawn {
  readonly geo: Geo;
  readonly spots: ButtonSpots;
}

const drawn = (width: number, height: number, others: number): Drawn => {
  const geo = computeGeo(width, height, others);

  return { geo, spots: buttonSpots(geo) };
};

const rideOf = (
  { geo, spots }: Drawn,
  owner: number,
  places: readonly (SeatPlace & { readonly index: number })[]
): ButtonSpot => {
  const spot = spots.seats[owner];
  const place = places.find(({ index }) => index === owner);
  const home = geo.seats[owner];

  if (spot === undefined || place === undefined || home === undefined) {
    return spots.self;
  }

  return {
    r: spot.r,
    x: place.x + (spot.x - home.x) * place.scale,
    y: place.y + (spot.y - home.y) * place.scale,
  };
};

const coveredBy = (
  table: Drawn,
  acting: Acting,
  actor: number,
  acts: boolean
) => {
  const { geo, spots } = table;
  const owner = acting.button < acting.others ? acting.button : null;

  const button: ButtonRide = {
    owner,
    spot: owner === null ? spots.self : (spots.seats[owner] ?? spots.self),
  };

  const seats = Array.from({ length: acting.others }, (__, index) => ({
    active: acts && index === actor,
    folded: index !== actor && acting.folded.includes(index),
    index,
    winner: false,
  }));

  const places = placeSeats(geo, {
    bets: acting.bets.filter((index) => index < acting.others),
    button,
    heroBet: acting.heroBet,
    seats,
    someoneElse: true,
  });

  const grown = places.find(({ index }) => index === actor);

  if (grown === undefined) {
    return ["the actor was not placed"];
  }

  const ground: readonly (readonly [string, Box])[] = [
    ...places
      .filter(({ index }) => index !== actor)
      .flatMap((place) =>
        seatBoxes(geo, place).map(
          (box, part) =>
            [
              `seat ${place.index} ${part === 0 ? "face" : "name"}`,
              box,
            ] as const
        )
      ),
    ["your face and name", tableObstacles(geo)[geo.seats.length] ?? geo.strip],
    ...acting.bets
      .filter((index) => index < acting.others && index !== actor)
      .flatMap((index) => {
        const bet = geo.seats[index]?.bet;

        return bet === undefined
          ? []
          : [[`seat ${index} bet`, pileBox(bet)] as const];
      }),
    ...(acting.heroBet ? [["your bet", pileBox(geo.heroBet)] as const] : []),
    ...(owner === actor
      ? []
      : [
          [
            "the dealer button",
            buttonBox(
              owner === null ? spots.self : rideOf(table, owner, places)
            ),
          ] as const,
        ]),
  ];

  return [
    ...(grown.scale < restingScale(true)
      ? [`shrank to ${grown.scale}, below the faces around it`]
      : []),
    ...seatBoxes(geo, grown).flatMap((box) =>
      ground.flatMap(([what, other]) => (covers(box, other) ? [what] : []))
    ),
  ];
};

const TABLE_BOXES = [
  { height: 592, width: 360 },
  { height: 632, width: 390 },
  { height: 796, width: 390 },
  { height: 342, width: 844 },
];

const SIX_SEATS_AS_REPORTED: Acting = {
  bets: [],
  button: 0,
  folded: [2],
  heroBet: false,
  others: 5,
};

const addedByActing = (table: Drawn, acting: Acting, actor: number) => {
  const atRest = coveredBy(table, acting, actor, false);

  return coveredBy(table, acting, actor, true).filter(
    (what) => !atRest.includes(what)
  );
};

describe("the seat whose turn it is", () => {
  it.prop(
    "grows without its face, name, or stack covering anything it did not already cover at rest: another seat's face, name, stack, or bet, your face, or the dealer button, whoever acts",
    { acting: actings, screen: screens },
    ({ acting, screen }) => {
      const actors = Array.from({ length: acting.others }, (__, at) => at);
      const table = drawn(screen.width, screen.height, acting.others);

      expect(
        actors.map((actor) => addedByActing(table, acting, actor))
      ).toStrictEqual(actors.map(() => []));
    },
    { arbitrary: { runs: 200 } }
  );

  it("covers nothing on the boxes the app gives the table, with two to nine seats and each one acting", () => {
    const found = TABLE_BOXES.flatMap(({ height, width }) =>
      [1, 2, 3, 4, 5, 6, 7, 8].flatMap((others) => {
        const table = drawn(width, height, others);

        return Array.from({ length: others }, (__, actor) =>
          coveredBy(
            table,
            { ...SIX_SEATS_AS_REPORTED, others },
            actor,
            true
          ).map(
            (what) =>
              `${width}x${height}, ${others + 1} seats, seat ${actor}: ${what}`
          )
        ).flat();
      })
    );

    expect(found).toStrictEqual([]);
  });
});
