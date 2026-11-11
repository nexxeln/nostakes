import {
  buttonBox,
  computeGeo,
  handHintBox,
  handHintGround,
  HINT_LINES,
  placeSeats,
  potTabOf,
  ridingScale,
} from "../../src/client/table/layout.js";
import type {
  Box,
  ButtonSpot,
  ButtonSpots,
  Geo,
  Pt,
  SeatPlace,
  Table,
} from "../../src/client/table/layout.js";

export const VISIBLE_PX = 1;

export const NAME_DEPTH = 46;

export const PEEK_LIFT_PX = 30;

export const SMALLEST_FACE_PX = 40;

export const SMALLEST_TALL = { height: 600, width: 360 };

export const SMALLEST_WIDE = { height: 350, width: 660 };

export const SHORTEST_WIDE = { height: 320, width: 740 };

export const SMALLEST_TABLES = [
  SMALLEST_TALL,
  SMALLEST_WIDE,
  SHORTEST_WIDE,
  { height: 592, width: 360 },
  { height: 632, width: 390 },
  { height: 796, width: 390 },
  { height: 342, width: 844 },
  { height: 852, width: 1440 },
];

export const supports = ({ height, width }: Screen) =>
  width < SMALLEST_WIDE.width
    ? width >= SMALLEST_TALL.width && height >= SMALLEST_TALL.height
    : height >= SMALLEST_WIDE.height ||
      (width >= SHORTEST_WIDE.width && height >= SHORTEST_WIDE.height);

const DRAWN_PILE_PX = new Map([
  [1, { compact: 9.5, full: 29.5 }],
  [2, { compact: 19, full: 39 }],
  [3, { compact: 28.4, full: 48.4 }],
  [4, { compact: 41.8, full: 61.8 }],
  [5, { compact: 51.3, full: 71.3 }],
]);

const DRAWN_TAG_PX = { narrow: 38, wide: 61.8 };

const DRAWN_PILE_HEIGHT = 22;

const DRAWN_TAG_HEIGHT = 20;

const TAG_GAP = 4;

export interface Screen {
  readonly height: number;
  readonly width: number;
}

export interface LaneTable {
  readonly button: number;
  readonly buttonFolded: boolean;
  readonly folded: readonly number[];
  readonly most: number;
  readonly others: number;
  readonly posted: readonly number[];
  readonly screen: Screen;
}

export const covers = (a: Box, b: Box) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) >= VISIBLE_PX &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) >= VISIBLE_PX;

export const gapToBox = (point: Pt, box: Box) =>
  Math.hypot(
    Math.max(box.x - point.x, 0, point.x - box.x - box.w),
    Math.max(box.y - point.y, 0, point.y - box.y - box.h)
  );

const onScreen = (box: Box, geo: Geo, { height, width }: Screen) =>
  box.x > -VISIBLE_PX &&
  box.y > geo.top - VISIBLE_PX &&
  box.x + box.w < width + VISIBLE_PX &&
  box.y + box.h < height + VISIBLE_PX;

export const rideOf = (
  geo: Geo,
  spots: ButtonSpots,
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

const drawnPileWidth = (most: number, compact: boolean) => {
  const measured = DRAWN_PILE_PX.get(String(most).length) ?? {
    compact: 0,
    full: 0,
  };

  return compact ? measured.compact : measured.full;
};

const drawnPile = (point: Pt, width: number): Box => ({
  h: DRAWN_PILE_HEIGHT,
  w: width,
  x: point.x - width / 2,
  y: point.y - DRAWN_PILE_HEIGHT / 2,
});

const faceOf = (centre: Pt, size: number, scale: number): readonly Box[] => [
  { h: size, w: size, x: centre.x - size / 2, y: centre.y - size / 2 },
  {
    h: NAME_DEPTH * scale,
    w: Math.max(size * 1.3, size),
    x: centre.x - Math.max(size * 0.65, size / 2),
    y: centre.y + size / 2,
  },
];

const nearestSeat = (point: Pt, seats: readonly (readonly Box[])[]) =>
  seats
    .map((boxes, index) => ({
      gap: Math.min(...boxes.map((box) => gapToBox(point, box))),
      index,
    }))
    .toSorted((left, right) => left.gap - right.gap)[0]?.index;

const centreOf = (box: Box): Pt => ({
  x: box.x + box.w / 2,
  y: box.y + box.h / 2,
});

interface Laid {
  readonly box: Box;
  readonly owner: number;
  readonly what: string;
}

type Named = readonly [string, Box];

const seatsDrawn = (
  geo: Geo,
  places: readonly (SeatPlace & { readonly index: number })[]
) => [
  ...geo.seats.map((home, index) => {
    const place = places.find((seat) => seat.index === index);

    return place === undefined
      ? faceOf(home, geo.tile, 1)
      : faceOf(place, geo.tile * place.scale, place.scale);
  }),
  faceOf(geo.self, geo.self.size, 1),
];

const tagBox = (geo: Table, pile: Box, seat: number): Box => {
  const wide = geo.tagSides.wideFits[seat] === true && !geo.compactPiles;
  const width = wide ? DRAWN_TAG_PX.wide : DRAWN_TAG_PX.narrow;
  const side = (wide ? geo.tagSides.wide : geo.tagSides.narrow)[seat];
  const middle = centreOf(pile);

  const at = {
    Above: {
      x: middle.x - width / 2,
      y: pile.y - TAG_GAP - DRAWN_TAG_HEIGHT,
    },
    After: { x: pile.x + pile.w + TAG_GAP, y: middle.y - DRAWN_TAG_HEIGHT / 2 },
    Before: {
      x: pile.x - TAG_GAP - width,
      y: middle.y - DRAWN_TAG_HEIGHT / 2,
    },
    Below: { x: middle.x - width / 2, y: pile.y + pile.h + TAG_GAP },
  }[side ?? "Before"];

  return { h: DRAWN_TAG_HEIGHT, w: width, ...at };
};

const middleOf = (geo: Geo): readonly Named[] => {
  const handW = geo.handCardW * 2.2;
  const handH = geo.handCardW * 1.4;
  const tab = potTabOf(geo);

  return [
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
};

const liftedCards = (geo: Geo): Box => {
  const handW = geo.handCardW * 2.2;
  const handH = geo.handCardW * 1.4;

  return {
    h: handH + PEEK_LIFT_PX,
    w: handW,
    x: geo.hand.x - handW / 2,
    y: geo.hand.y - handH / 2 - PEEK_LIFT_PX,
  };
};

const covering = (item: Laid, ground: readonly Named[]) =>
  ground.flatMap(([what, box]) =>
    covers(item.box, box) ? [`${item.what} covers ${what}`] : []
  );

const coveringLaid = (item: Laid, laid: readonly Laid[]) =>
  laid.flatMap((other) =>
    other !== item && covers(item.box, other.box)
      ? [`${item.what} covers ${other.what}`]
      : []
  );

export const laneProblemsOn = (
  table: LaneTable,
  geo: Table
): readonly string[] => {
  const you = table.others;
  const owner = table.button < table.others ? table.button : null;
  const posted = [...new Set(table.posted.filter((seat) => seat <= you))];
  const piles = [...geo.seats.map(({ bet }) => bet), geo.heroBet];
  const pileWidth = drawnPileWidth(table.most, geo.compactPiles);
  const pileBoxes = piles.map((pile) => drawnPile(pile, pileWidth));

  const bets: readonly Laid[] = pileBoxes.map((box, seat) => ({
    box,
    owner: seat,
    what: `seat ${seat} bet`,
  }));

  const tags: readonly Laid[] = posted.map((seat) => ({
    box: tagBox(geo, pileBoxes[seat] ?? drawnPile(geo.interior, 0), seat),
    owner: seat,
    what: `seat ${seat} tag`,
  }));

  const fixed = [...bets, ...tags];
  const middle = middleOf(geo);

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
    tags: tags.map(({ box }) => box),
  });

  const buttonAt = (
    places: readonly (SeatPlace & { readonly index: number })[]
  ): Laid => ({
    box: buttonBox(
      owner === null
        ? geo.buttons.self
        : rideOf(geo, geo.buttons, owner, places)
    ),
    owner: owner ?? you,
    what: "the button",
  });

  const resting = placeSeats(geo, plan(null, false));
  const restingSeats = seatsDrawn(geo, resting);

  const behind = piles.flatMap((pile, seat) => {
    const home = geo.seats[seat];
    const at = home ?? geo.self;

    const toward =
      home === undefined ? { x: 0, y: -1 } : { x: home.nx, y: home.ny };

    const ahead = (pile.x - at.x) * toward.x + (pile.y - at.y) * toward.y;

    return ahead > 0 ? [] : [`seat ${seat} bet lies behind its seat`];
  });

  const owned = [...fixed, buttonAt(resting)].flatMap((item) =>
    nearestSeat(centreOf(item.box), restingSeats) === item.owner
      ? []
      : [`${item.what} lies nearer another seat`]
  );

  const laidOnce = fixed.flatMap((item) => [
    ...(onScreen(item.box, geo, table.screen)
      ? []
      : [`${item.what} leaves the table`]),
    ...covering(item, middle),
    ...coveringLaid(item, fixed),
  ]);

  const actors = [
    null,
    ...Array.from({ length: table.others }, (__, seat) => seat),
  ];

  const whileActing = actors.flatMap((actor) => {
    const places = placeSeats(geo, plan(actor, true));

    const seats: readonly Named[] = seatsDrawn(geo, places).flatMap(
      (boxes, seat) =>
        boxes.map(
          (box, part) =>
            [`seat ${seat} ${part === 0 ? "face" : "name"}`, box] as const
        )
    );

    const button = buttonAt(places);

    const forButton: readonly Named[] = [
      ...middle,
      ...(actor === null
        ? [["the hint", handHintBox(geo, geo.hint)] as const]
        : []),
      ["your cards as they lift", liftedCards(geo)],
    ];

    return [
      ...fixed.flatMap((item) => covering(item, seats)),
      ...(onScreen(button.box, geo, table.screen)
        ? []
        : [`${button.what} leaves the table`]),
      ...covering(button, [...seats, ...forButton]),
      ...coveringLaid(button, fixed),
    ].map(
      (problem) =>
        `${actor === null ? "nobody" : `seat ${actor}`} acting: ${problem}`
    );
  });

  return [
    ...(geo.fits ? [] : ["the table says its lanes do not fit"]),
    ...behind,
    ...owned,
    ...laidOnce,
    ...whileActing,
  ];
};

export const laneProblemsOf = (table: LaneTable) =>
  laneProblemsOn(
    table,
    computeGeo(
      table.screen.width,
      table.screen.height,
      table.others,
      table.most
    )
  );

export const everyoneBetting = (
  screen: Screen,
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

export const everyOwnerProblems = (screen: Screen, others: number) => {
  const geo = computeGeo(screen.width, screen.height, others, 9999);

  return Array.from({ length: others + 1 }, (__, button) =>
    [false, true].flatMap((folded) =>
      laneProblemsOn(everyoneBetting(screen, others, button, folded), geo).map(
        (problem) =>
          `${screen.width}x${screen.height}, ${others + 1} seats, button ${button}${folded ? " folded" : ""}: ${problem}`
      )
    )
  ).flat();
};

export const fallbackOf = (screen: Screen, others: number, most: number) => {
  const geo = computeGeo(screen.width, screen.height, others, most);

  return {
    facesAtLeastTheFloor: geo.tile >= SMALLEST_FACE_PX,
    saysWhenLanesDoNotFit:
      geo.fits || (geo.tile === SMALLEST_FACE_PX && geo.compactPiles),
  };
};

export const hintPlaced = (geo: Table, { height, width }: Screen) => {
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

export const HINT_PLACED_WELL = {
  firstLine: true,
  secondLine: true,
  slipHoldsTheLongestLineInTwo: true,
};
