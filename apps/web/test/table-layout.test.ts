import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  buttonBox,
  buttonGround,
  computeGeo,
  handHintBox,
  handHintGround,
  HINT_LINES,
  pileBox,
  placeSeats,
  ridingScale,
  restingScale,
  POST_TAG_WIDTHS,
  potTabOf,
  postTagBox,
  postTagGround,
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

const SMALLEST_TALL = { height: 600, width: 360 };

const SMALLEST_WIDE = { height: 350, width: 660 };

const SHORTEST_WIDE = { height: 320, width: 740 };

const SUPPORTED_TABLES = [
  Schema.Struct({
    height: between(SMALLEST_TALL.height, 1000),
    width: between(SMALLEST_TALL.width, SMALLEST_WIDE.width - 1),
  }),
  Schema.Struct({
    height: between(SMALLEST_WIDE.height, 1000),
    width: between(SMALLEST_WIDE.width, 1440),
  }),
  Schema.Struct({
    height: between(SHORTEST_WIDE.height, SMALLEST_WIDE.height - 1),
    width: between(SHORTEST_WIDE.width, 1440),
  }),
] as const;

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

const PEEK_LIFT_PX = 30;

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
  const spots = geo.buttons;
  const grounds = buttonGround(geo, handHintBox(geo, geo.hint));

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
  Schema.Union(
    SUPPORTED_TABLES.map(({ fields }) =>
      Schema.Struct({ ...fields, others: seated.others })
    )
  )
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

  const tags = [
    { sides: geo.tagSides.narrow, tagWidth: POST_TAG_WIDTHS.narrow },
    { sides: geo.tagSides.wide, tagWidth: POST_TAG_WIDTHS.wide },
  ];

  return tags.flatMap(({ sides, tagWidth }) =>
    piles.filter(
      (pile, index) =>
        (tagWidth === POST_TAG_WIDTHS.narrow ||
          geo.tagSides.wideFits[index] === true) &&
        (grounds[index]?.others ?? []).some((other) =>
          covers(
            postTagBox(pile, sides[index] ?? "Before", tagWidth, geo.pileW),
            other
          )
        )
    )
  ).length;
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
  const { hint } = geo;
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

  return { geo, spots: geo.buttons };
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
    x: place.x + (spot.x - home.x) * ridingScale(place.scale),
    y: place.y + (spot.y - home.y) * ridingScale(place.scale),
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
    tags: [],
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
          : [[`seat ${index} bet`, pileBox(bet, geo.pileW)] as const];
      }),
    ...(acting.heroBet
      ? [["your bet", pileBox(geo.heroBet, geo.pileW)] as const]
      : []),
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

const LaneTableSchema = Schema.Struct({
  button: between(0, 8),
  buttonFolded: Schema.Boolean,
  folded: Schema.Array(between(0, 7)),
  most: between(1, 9999),
  others: between(1, 8),
  posted: Schema.Array(between(0, 8)),
  screen: Schema.Union(SUPPORTED_TABLES),
});

type LaneTable = typeof LaneTableSchema.Type;

const DRAWN_PILE_PX = new Map([
  [1, { compact: 9.5, full: 29.5 }],
  [2, { compact: 19, full: 39 }],
  [3, { compact: 28.4, full: 48.4 }],
  [4, { compact: 41.8, full: 61.8 }],
  [5, { compact: 51.3, full: 71.3 }],
]);

const DRAWN_TAG_PX = { narrow: 38, wide: 61.8 };

const SMALLEST_FACE_PX = 40;

const drawnPileWidth = (most: number, compact: boolean) => {
  const measured = DRAWN_PILE_PX.get(String(most).length) ?? {
    compact: 0,
    full: 0,
  };

  return compact ? measured.compact : measured.full;
};

const drawnPile = (point: Pt, width: number): Box => ({
  h: 22,
  w: width,
  x: point.x - width / 2,
  y: point.y - 11,
});

const laneTables = Arbitrary.schema(LaneTableSchema);

const faceOf = (centre: Pt, size: number, scale: number): readonly Box[] => [
  { h: size, w: size, x: centre.x - size / 2, y: centre.y - size / 2 },
  {
    h: NAME_DEPTH * scale,
    w: Math.max(size * 1.3, size),
    x: centre.x - Math.max(size * 0.65, size / 2),
    y: centre.y + size / 2,
  },
];

const nearestTo = (point: Pt, seats: readonly (readonly Box[])[]) =>
  seats
    .map((boxes, index) => ({
      gap: Math.min(...boxes.map((box) => gapToBox(point, box))),
      index,
    }))
    .toSorted((left, right) => left.gap - right.gap);

const centre = (box: Box): Pt => ({
  x: box.x + box.w / 2,
  y: box.y + box.h / 2,
});

interface Laid {
  readonly what: string;
  readonly box: Box;
  readonly owner: number;
}

const laneProblems = (
  table: LaneTable,
  geo: ReturnType<typeof computeGeo>,
  actor: number | null
) => {
  const { height, width } = table.screen;
  const you = table.others;
  const owner = table.button < table.others ? table.button : null;
  const posted = new Set(table.posted.filter((seat) => seat <= you));

  const piles = [...geo.seats.map(({ bet }) => bet), geo.heroBet];
  const pileWidth = drawnPileWidth(table.most, geo.compactPiles);

  const tagOf = (seat: number) => {
    const pile = drawnPile(piles[seat] ?? geo.interior, pileWidth);
    const wide = geo.tagSides.wideFits[seat] === true && !geo.compactPiles;
    const tagWidth = wide ? DRAWN_TAG_PX.wide : DRAWN_TAG_PX.narrow;
    const side = (wide ? geo.tagSides.wide : geo.tagSides.narrow)[seat];
    const gap = 4;
    const middle = { x: pile.x + pile.w / 2, y: pile.y + pile.h / 2 };

    const at = {
      Above: { x: middle.x - tagWidth / 2, y: pile.y - gap - 20 },
      After: { x: pile.x + pile.w + gap, y: middle.y - 10 },
      Before: { x: pile.x - gap - tagWidth, y: middle.y - 10 },
      Below: { x: middle.x - tagWidth / 2, y: pile.y + pile.h + gap },
    }[side ?? "Before"];

    return { h: 20, w: tagWidth, ...at };
  };

  const plan = (active: number | null, folding: boolean) => ({
    bets: geo.seats.map((__, index) => index),
    button: {
      owner,
      spot:
        owner === null
          ? geo.buttons.self
          : (geo.buttons.seats[owner] ?? geo.buttons.self),
    },
    heroBet: true,
    seats: geo.seats.map((__, index) => ({
      active: index === active,
      folded:
        folding &&
        index !== active &&
        (table.folded.includes(index) ||
          (table.buttonFolded && index === owner)),
      index,
      winner: false,
    })),
    someoneElse: active !== null,
    tags: [...posted].map(tagOf),
  });

  const atRest = placeSeats(geo, plan(null, false));
  const places = placeSeats(geo, plan(actor, true));

  const seatsAt = (seatPlaces: typeof places) => [
    ...geo.seats.map((home, index) => {
      const place = seatPlaces.find((seat) => seat.index === index);

      return place === undefined
        ? faceOf(home, geo.tile, 1)
        : faceOf(place, geo.tile * place.scale, place.scale);
    }),
    faceOf(geo.self, geo.self.size, 1),
  ];

  const resting = seatsAt(atRest);
  const drawnSeats = seatsAt(places);

  const buttonAt = (seatPlaces: typeof places) =>
    buttonBox(
      owner === null
        ? geo.buttons.self
        : rideOf({ geo, spots: geo.buttons }, owner, seatPlaces)
    );

  const laid: readonly Laid[] = [
    ...piles.map((pile, seat) => ({
      box: drawnPile(pile, pileWidth),
      owner: seat,
      what: `seat ${seat} bet`,
    })),
    ...[...posted].map((seat) => ({
      box: tagOf(seat),
      owner: seat,
      what: `seat ${seat} tag`,
    })),
    { box: buttonAt(places), owner: owner ?? you, what: "the button" },
  ];

  const handW = geo.handCardW * 2.2;
  const handH = geo.handCardW * 1.4;
  const tab = potTabOf(geo);

  const middle: readonly (readonly [string, Box])[] = [
    ["the board", geo.strip],
    [
      "the pot tab",
      { h: tab.h, w: tab.w, x: tab.x - tab.w / 2, y: tab.y - tab.h / 2 },
    ],
    [
      "your cards",
      {
        h: handH,
        w: handW,
        x: geo.hand.x - handW / 2,
        y: geo.hand.y - handH / 2,
      },
    ],
    [
      "the chip",
      {
        h: geo.chip.size,
        w: geo.chip.size,
        x: geo.chip.x - geo.chip.size / 2,
        y: geo.chip.y - geo.chip.size / 2,
      },
    ],
  ];

  const ground: readonly (readonly [string, Box])[] = [
    ...middle,
    ...drawnSeats.flatMap((boxes, seat) =>
      boxes.map(
        (box, part) =>
          [`seat ${seat} ${part === 0 ? "face" : "name"}`, box] as const
      )
    ),
  ];

  const forButton: readonly (readonly [string, Box])[] = [
    ...(actor === null
      ? [["the hint", handHintBox(geo, geo.hint)] as const]
      : []),
    [
      "your cards as they lift",
      {
        h: handH + PEEK_LIFT_PX,
        w: handW,
        x: geo.hand.x - handW / 2,
        y: geo.hand.y - handH / 2 - PEEK_LIFT_PX,
      },
    ],
  ];

  const restingButton = {
    box: buttonAt(atRest),
    owner: owner ?? you,
    what: "the button",
  };

  const facingOf = (seat: number) => {
    const home = geo.seats[seat];

    return home === undefined
      ? { at: geo.self, toward: { x: 0, y: -1 } }
      : { at: home, toward: { x: home.nx, y: home.ny } };
  };

  const behind = piles.flatMap((pile, seat) => {
    const { at, toward } = facingOf(seat);
    const ahead = (pile.x - at.x) * toward.x + (pile.y - at.y) * toward.y;

    return ahead > 0 ? [] : [`seat ${seat} bet lies behind its seat`];
  });

  return [
    ...behind,
    ...laid.flatMap((item) => [
      ...(item.box.x > -VISIBLE_PX &&
      item.box.y > geo.top - VISIBLE_PX &&
      item.box.x + item.box.w < width + VISIBLE_PX &&
      item.box.y + item.box.h < height + VISIBLE_PX
        ? []
        : [`${item.what} leaves the table`]),
      ...[...ground, ...(item.what === "the button" ? forButton : [])].flatMap(
        ([what, box]) =>
          covers(item.box, box) ? [`${item.what} covers ${what}`] : []
      ),
      ...laid.flatMap((other) =>
        other !== item && covers(item.box, other.box)
          ? [`${item.what} covers ${other.what}`]
          : []
      ),
    ]),
    ...[
      ...laid.filter(({ what }) => what !== "the button"),
      restingButton,
    ].flatMap((item) =>
      nearestTo(centre(item.box), resting)[0]?.index === item.owner
        ? []
        : [`${item.what} lies nearer another seat`]
    ),
  ];
};

const laneProblemsOn = (
  table: LaneTable,
  geo: ReturnType<typeof computeGeo>
) => [
  ...(geo.fits ? [] : ["the table says its lanes do not fit"]),
  ...[
    null,
    ...Array.from({ length: table.others }, (__, seat) => seat),
  ].flatMap((actor) =>
    laneProblems(table, geo, actor).map(
      (problem) =>
        `${actor === null ? "nobody" : `seat ${actor}`} acting: ${problem}`
    )
  ),
];

const laneProblemsOf = (table: LaneTable) =>
  laneProblemsOn(
    table,
    computeGeo(
      table.screen.width,
      table.screen.height,
      table.others,
      table.most
    )
  );

const SMALLEST_TABLES = [
  SMALLEST_TALL,
  SMALLEST_WIDE,
  SHORTEST_WIDE,
  { height: 592, width: 360 },
  { height: 632, width: 390 },
  { height: 796, width: 390 },
  { height: 342, width: 844 },
  { height: 852, width: 1440 },
];

const everyoneBetting = (
  screen: { readonly height: number; readonly width: number },
  others: number,
  button: number,
  buttonFolded: boolean
): LaneTable => ({
  button,
  buttonFolded,
  folded: [],
  most: 9999,
  others,
  posted: Array.from({ length: others + 1 }, (__, seat) => seat),
  screen,
});

const TooSmallSchema = Schema.Struct({
  height: between(240, 1000),
  most: between(1, 99_999),
  others: between(1, 8),
  width: between(300, 1440),
});

const fallbackOf = ({
  height,
  most,
  others,
  width,
}: typeof TooSmallSchema.Type) => {
  const geo = computeGeo(width, height, others, most);

  return {
    facesAtLeastTheFloor: geo.tile >= SMALLEST_FACE_PX,
    saysWhenLanesDoNotFit:
      geo.fits || (geo.tile === SMALLEST_FACE_PX && geo.compactPiles),
  };
};

describe("each seat's lane", () => {
  it.prop(
    "holds its bet, its tag, and the button clear of every face, name, stack, other bet, the board, the pot tab, your cards, and the chip, with the bet in front of its seat and each nearer its own seat than any other, with nobody acting and with each seat acting, on every table the app supports",
    { table: laneTables },
    ({ table }) => {
      expect(laneProblemsOf(table)).toStrictEqual([]);
    },
    { arbitrary: { runs: 300 } }
  );

  it("fits with every seat betting and four-digit amounts, whoever holds the button and whether they folded, on the smallest tables the app supports and on the boxes it gives the table", () => {
    const found = SMALLEST_TABLES.flatMap((screen) =>
      [1, 2, 3, 4, 5, 6, 7, 8].flatMap((others) => {
        const geo = computeGeo(screen.width, screen.height, others, 9999);

        return Array.from({ length: others + 1 }, (__, button) =>
          [false, true].flatMap((folded) =>
            laneProblemsOn(
              everyoneBetting(screen, others, button, folded),
              geo
            ).map(
              (problem) =>
                `${screen.width}x${screen.height}, ${others + 1} seats, button ${button}${folded ? " folded" : ""}: ${problem}`
            )
          )
        ).flat();
      })
    );

    expect(found).toStrictEqual([]);
  });

  it.prop(
    "never draws a face below the floor, and on a table too small for its lanes says so, with faces at the floor and the bets drawn without their chips",
    { table: Arbitrary.schema(TooSmallSchema) },
    ({ table }) => {
      expect(fallbackOf(table)).toStrictEqual({
        facesAtLeastTheFloor: true,
        saysWhenLanesDoNotFit: true,
      });
    },
    { arbitrary: { runs: 60 } }
  );
});
