import {
  boxOfPart,
  choicesOf,
  DEFAULT_AVATAR,
  EXPRESSIONS,
  PLACED_PARTS,
  SPECIES,
} from "@nostakes/avatar";
import { Option } from "effect";

import {
  buttonBox,
  computeGeo,
  flightControl,
  FELT_RULES_TAP_PX,
  feltRulesBox,
  handHintBox,
  restingPlaces,
  waitingCallBox,
  handHintGround,
  HINT_LINES,
  PIC_LIFT,
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

const DRAWN_CAPTION_INK_PX = 43.5;

export const CAPTION_GAP_PX = 3;

const FACE_UNITS = 100;

const drawnParts = SPECIES.flatMap((species) =>
  PLACED_PARTS.flatMap((part) =>
    choicesOf(part).flatMap((choice) =>
      EXPRESSIONS.flatMap((expression) =>
        Option.toArray(
          boxOfPart(
            { ...DEFAULT_AVATAR, [part]: choice, species },
            part,
            expression
          )
        )
      )
    )
  )
);

const DRAWN_FACE = {
  above: Math.max(
    0,
    PIC_LIFT - Math.min(...drawnParts.map(({ y }) => y)) / FACE_UNITS
  ),
  right: Math.max(
    0,
    Math.max(...drawnParts.map(({ width, x }) => x + width)) / FACE_UNITS - 1
  ),
};

const drawnFaceOf = (centre: Pt, size: number): Box => ({
  h: size * (1 + DRAWN_FACE.above),
  w: size * (1 + DRAWN_FACE.right),
  x: centre.x - size / 2,
  y: centre.y - size / 2 - size * DRAWN_FACE.above,
});

const inkWithGapOf = (centre: Pt, size: number, scale: number): Box => ({
  h: (DRAWN_CAPTION_INK_PX + CAPTION_GAP_PX) * scale,
  w: Math.max(size * 1.3, size),
  x: centre.x - Math.max(size * 0.65, size / 2),
  y: centre.y + size / 2,
});

const reaches = (a: Box, b: Box) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.1 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.1;

const captionsNearFaces = (
  geo: Geo,
  places: readonly (SeatPlace & { readonly index: number })[],
  when: string
): readonly string[] => {
  const drawn = [
    ...geo.seats.map((home, index) => {
      const place = places.find((seat) => seat.index === index);
      const scale = place?.scale ?? 1;

      return { centre: place ?? home, scale, size: geo.tile * scale };
    }),
    { centre: geo.self, scale: 1, size: geo.self.size },
  ];

  return drawn.flatMap((mine, seat) =>
    drawn.flatMap((theirs, other) =>
      other !== seat &&
      reaches(
        inkWithGapOf(mine.centre, mine.size, mine.scale),
        drawnFaceOf(theirs.centre, theirs.size)
      )
        ? [
            `${when}: seat ${seat}'s name or stack comes within ${CAPTION_GAP_PX} px of seat ${other}'s drawn face`,
          ]
        : []
    )
  );
};

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

const AWARD_TAB_PX = { h: 22, inset: 8, rise: 13 };

const DRAWN_AWARD_PX = new Map([
  [1, 48],
  [2, 48],
  [3, 50.1],
  [4, 62.1],
  [5, 70.7],
]);

const awardTabWidth = (most: number) =>
  DRAWN_AWARD_PX.get(String(most).length) ?? 0;

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
    tabShifts: geo.tabShifts,
    tabsInside: geo.tabsInside,
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

  const captionsOnFaces = captionsNearFaces(geo, resting, "at rest");

  const captionsInTheMiddle = restingSeats.flatMap(([, caption], seat) =>
    seat === you || caption === undefined || !geo.boardInStrip
      ? []
      : middle.flatMap(([what, box]) =>
          covers(caption, box)
            ? [`seat ${seat} name or stack covers ${what} at rest`]
            : []
        )
  );

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
      ...captionsNearFaces(geo, places, "grown"),
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

  const restingOthers = (winner: number): readonly Named[] =>
    restingSeats.flatMap((boxes, seat) =>
      seat === winner
        ? []
        : boxes.map(
            (box, part) =>
              [`seat ${seat} ${part === 0 ? "face" : "name"}`, box] as const
          )
    );

  const halfCard = { h: geo.cardW * 0.7, w: geo.cardW / 2 };
  const cardXs = geo.board.map(({ x }) => x);
  const cardYs = geo.board.map(({ y }) => y);

  const boardCards: Box = {
    h: Math.max(...cardYs) - Math.min(...cardYs) + halfCard.h * 2,
    w: Math.max(...cardXs) - Math.min(...cardXs) + halfCard.w * 2,
    x: Math.min(...cardXs) - halfCard.w,
    y: Math.min(...cardYs) - halfCard.h,
  };

  const hintLines: readonly Named[] = [
    ["the hint's first line", geo.hint.say],
    ["the hint's second line", geo.hint.foot],
  ];

  const winners = [...new Set([owner ?? you, you])];

  const awarded = winners.flatMap((winner) => {
    const places = placeSeats(geo, {
      ...plan(null, false),
      bets: [],
      heroBet: false,
      seats: geo.seats.map((__, index) => ({
        active: false,
        folded: false,
        index,
        winner: index === winner,
      })),
      tags: [],
    });

    const seats = seatsDrawn(geo, places);
    const place = places.find(({ index }) => index === winner);
    const scale = place?.scale ?? 1;
    const centre = place ?? geo.self;
    const size = place === undefined ? geo.self.size : geo.tile * scale;
    const inside = geo.tabsInside[winner] === true;
    const shift = (geo.tabShifts[winner] ?? 0) * scale;
    const width = awardTabWidth(table.most) * scale;

    const tab: Laid = {
      box: {
        h: AWARD_TAB_PX.h * scale,
        w: width,
        x: centre.x - width / 2 + shift,
        y:
          centre.y -
          size / 2 +
          (inside ? AWARD_TAB_PX.inset : -AWARD_TAB_PX.rise) * scale,
      },
      owner: winner,
      what: `seat ${winner} award tab`,
    };

    const others: readonly Named[] = seats.flatMap((boxes, seat) =>
      seat === winner
        ? []
        : boxes.map(
            (box, part) =>
              [`seat ${seat} ${part === 0 ? "face" : "name"}`, box] as const
          )
    );

    const grown: readonly Laid[] = (seats[winner] ?? []).map((box, part) => ({
      box,
      owner: winner,
      what: `seat ${winner} winning ${part === 0 ? "face" : "name"}`,
    }));

    return [
      ...(onScreen(tab.box, geo, table.screen)
        ? []
        : [`${tab.what} leaves the table`]),
      ...covering(tab, [
        ...others,
        ["the board's cards", boardCards],
        ...(winner === you ? middle.slice(1, 2) : middle.slice(1)),
        ...hintLines,
      ]),
      ...(winner === you
        ? []
        : grown.flatMap((item, part) => {
            const before = new Set(
              covering(
                { ...item, box: restingSeats[winner]?.[part] ?? item.box },
                [...restingOthers(winner), ...middle]
              ).map((problem) => problem.replace(/^.* covers /u, ""))
            );

            return covering(item, [...others, ...middle]).filter(
              (problem) => !before.has(problem.replace(/^.* covers /u, ""))
            );
          })),
    ];
  });

  return [
    ...(geo.fits ? [] : ["the table says its lanes do not fit"]),
    ...captionsOnFaces,
    ...captionsInTheMiddle,
    ...behind,
    ...owned,
    ...laidOnce,
    ...whileActing,
    ...awarded,
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

export const feltRulesPlaced = (geo: Table, screen: Screen) => {
  const card = feltRulesBox(geo);
  const call = waitingCallBox(geo);
  const seats = seatsDrawn(geo, restingPlaces(geo)).flat();

  return {
    callClearOfEverySeat: seats.every((box) => !covers(call, box)),
    callClearOfTheRules: !covers(call, card),
    callOnScreen: onScreen(call, geo, screen),
    clearOfEverySeat: seats.every((box) => !covers(card, box)),
    onScreen: onScreen(card, geo, screen),
    tallEnoughToTap: card.h >= FELT_RULES_TAP_PX,
  };
};

export const FELT_RULES_PLACED_WELL = {
  callClearOfEverySeat: true,
  callClearOfTheRules: true,
  callOnScreen: true,
  clearOfEverySeat: true,
  onScreen: true,
  tallEnoughToTap: true,
};

export const HINT_PLACED_WELL = {
  firstLine: true,
  secondLine: true,
  slipHoldsTheLongestLineInTwo: true,
};

const CHIP_HALF = 10;

const chipAt = (point: Pt): Box => ({
  h: CHIP_HALF * 2,
  w: CHIP_HALF * 2,
  x: point.x - CHIP_HALF,
  y: point.y - CHIP_HALF,
});

const PATH_ENDS = 0.06;

const crossesLines = (from: Pt, control: Pt, to: Pt, lines: readonly Box[]) => {
  const steps = Math.ceil(
    Math.hypot(control.x - from.x, control.y - from.y) +
      Math.hypot(to.x - control.x, to.y - control.y)
  );

  return Array.from({ length: steps + 1 }, (__, step) => {
    const u = PATH_ENDS + ((1 - 2 * PATH_ENDS) * step) / steps;

    return {
      x: (1 - u) ** 2 * from.x + 2 * (1 - u) * u * control.x + u * u * to.x,
      y: (1 - u) ** 2 * from.y + 2 * (1 - u) * u * control.y + u * u * to.y,
    };
  }).some((point) => lines.some((line) => covers(chipAt(point), line)));
};

const AWARD_ARCS = { others: -60, you: 80 };

const AWARD_SPREAD = { from: 8, toX: 3.5, toY: 2.5 };

export const flightsOverTheHint = (geo: Table) => {
  const lines = [geo.hint.say, geo.hint.foot];
  const you = geo.seats.length;

  const stackOf = (face: Pt, size: number) => ({
    x: face.x,
    y: face.y + size / 2 + geo.caption * 0.62,
  });

  const stacks = [
    ...geo.seats.map((seat) => stackOf(seat, geo.tile)),
    stackOf(geo.self, geo.self.size),
  ];

  const spreads = [-1, 0, 1];

  const tabOf = (seat: number): Box => {
    const face = geo.seats[seat] ?? geo.self;
    const size = seat === you ? geo.self.size : geo.tile;
    const inside = geo.tabsInside[seat] === true;

    return {
      h: AWARD_TAB_PX.h,
      w: geo.tabW,
      x: face.x - geo.tabW / 2 + (geo.tabShifts[seat] ?? 0),
      y: face.y - size / 2 + (inside ? AWARD_TAB_PX.inset : -AWARD_TAB_PX.rise),
    };
  };

  const flights = stacks.flatMap((stack, seat) =>
    spreads.flatMap((across) =>
      spreads.map((along) => ({
        arc: seat === you ? AWARD_ARCS.you : AWARD_ARCS.others,
        avoid: [...lines, tabOf(seat)],
        from: {
          x: geo.pot.x + across * AWARD_SPREAD.from,
          y: geo.pot.y - 10,
        },
        to: {
          x: stack.x + along * AWARD_SPREAD.toX,
          y: stack.y + across * AWARD_SPREAD.toY,
        },
        what: `the pot going to seat ${seat}`,
      }))
    )
  );

  return [
    ...new Set(
      flights.flatMap(({ arc, avoid, from, to, what }) => {
        const ends = [chipAt(from), chipAt(to)];

        if (ends.some((end) => avoid.some((box) => covers(end, box)))) {
          return [];
        }

        const control = flightControl(from, to, arc, avoid, CHIP_HALF);

        return crossesLines(from, control, to, avoid)
          ? [`${what} crosses the hint or the winner's award tab`]
          : [];
      })
    ),
  ];
};
