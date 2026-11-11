import type { Expression } from "@nostakes/avatar";
import type { SeatIndex } from "@nostakes/engine";

import type { Deck, Theme } from "../../model.js";
import { paletteFor } from "../../pictures/paper.js";
import type { Palette } from "../../pictures/paper.js";
import { chipsText } from "../captions.js";
import type { Ease, FilmKey, Pose, Shot } from "../film.js";
import type { ScoreSheet, SmallCue, SmallSound } from "../sound/sheet.js";
import { REST } from "../timeline.js";
import {
  BURST_SCALE,
  CARD_WIDTH,
  CENTRE,
  FRAME,
  GROUND_SCALE,
  HERO_WIDTH,
  bandSprite,
  blockSprite,
  burstSprite,
  cardSprite,
  faceSprite,
  fillOf,
  groundSprite,
  halfSprite,
  halved,
  pictureSprite,
  slipSprite,
  typeSize,
  typeSprite,
} from "./art.js";
import type { Ground, Paint, Sprite, Tone } from "./art.js";
import {
  BEATS_IN_BAR,
  BUILD_BEAT,
  CARD_BEATS,
  CLAP_STEPS,
  DROP_BEAT,
  FRAMES_IN_BEAT,
  GAP_BEAT,
  KICK_STEPS,
  POT_BEATS,
  REACTION_BEATS,
  ROLL_BEAT,
  STEPS_IN_BEAT,
  WIND_UP_BEAT,
  frameOfBeat,
  msOfFrame,
} from "./groove.js";
import type {
  ActItem,
  CardItem,
  DriftItem,
  DriftPerson,
  DriftTold,
} from "./told.js";

export interface DriftShot extends Shot {
  readonly paint: Paint;
  readonly shows: readonly string[];
}

export type Layout =
  | "Board"
  | "Card"
  | "Cards"
  | "Close"
  | "Drop"
  | "Pot"
  | "Solo"
  | "Split";

export interface DriftBeat {
  readonly at: number;
  readonly hold: number;
  readonly layout: Layout;
  readonly name: string;
}

export interface DriftPlan {
  readonly beats: readonly DriftBeat[];
  readonly camera: readonly FilmKey[];
  readonly cardAt: number;
  readonly dealt: readonly { readonly at: number; readonly card: string }[];
  readonly dropAt: number;
  readonly length: number;
  readonly sheet: ScoreSheet;
  readonly shots: readonly DriftShot[];
}

export interface DriftLook {
  readonly calm: boolean;
  readonly deck: Deck;
  readonly kept: { readonly shows: readonly string[]; readonly svg: string };
  readonly seed: number;
  readonly theme: Theme;
}

interface Span {
  readonly from: number;
  readonly to: number;
}

interface Rest {
  readonly scale?: number;
  readonly turn?: number;
  readonly x: number;
  readonly y: number;
}

type Entrance = "Cut" | "Rise" | "Slam";

interface Stage {
  readonly beats: {
    readonly frame: number;
    readonly layout: Layout;
    readonly name: string;
  }[];
  readonly calm: boolean;
  readonly claps: readonly number[];
  readonly cues: SmallCue[];
  readonly dealt: { readonly at: number; readonly card: string }[];
  readonly grounds: { readonly frame: number; readonly ground: Ground }[];
  readonly hits: { readonly frame: number; readonly strength: number }[];
  readonly last: { layout: Layout };
  readonly palette: Palette;
  readonly punches: { readonly by: number; readonly span: Span }[];
  readonly shots: DriftShot[];
  readonly steps: { readonly frame: number; readonly scale: number }[];
  readonly theme: Theme;
}

const ORIGIN = { x: 0, y: 0 };

const posed = (rest: Rest, more: Partial<Pose> = {}): Pose => ({
  ...REST,
  dx: rest.x,
  dy: rest.y,
  scale: rest.scale ?? 1,
  turn: rest.turn ?? 0,
  ...more,
});

const key = (frame: number, pose: Pose, ease: Ease = "Out"): FilmKey => ({
  at: msOfFrame(frame),
  ease,
  pose,
});

const gone = (frame: number, rest: Rest) =>
  key(frame, posed(rest, { opacity: 0 }), "Hold");

const SLAM_FRAMES = 2;

const SLAM_SCALE = 1.22;

const windowKeys = (
  stage: Stage,
  span: Span,
  rest: Rest,
  entrance: Entrance
): FilmKey[] => {
  const landed = Math.min(span.to - 1, span.from + SLAM_FRAMES);

  if (stage.calm || entrance === "Cut" || landed <= span.from) {
    return [key(span.from, posed(rest)), gone(span.to, rest)];
  }

  return [
    key(
      span.from,
      entrance === "Slam"
        ? posed(rest, { scale: (rest.scale ?? 1) * SLAM_SCALE })
        : posed(rest, { dy: rest.y + 70, opacity: 0.4 })
    ),
    key(landed, posed(rest)),
    gone(span.to, rest),
  ];
};

const put = (
  stage: Stage,
  sprite: Sprite,
  keys: readonly FilmKey[],
  pinned = false
) => {
  stage.shots.push({ ...sprite, keys, pinned, pivot: ORIGIN });
};

const enter = (
  stage: Stage,
  sprite: Sprite,
  span: Span,
  place: Rest & { readonly entrance: Entrance }
) => {
  put(stage, sprite, windowKeys(stage, span, place, place.entrance));
};

const picked = (stage: Stage, wanted: readonly Layout[]): Layout => {
  const layout =
    wanted.find((each) => each !== stage.last.layout) ?? wanted[0] ?? "Close";

  return layout;
};

const cut = (
  stage: Stage,
  frame: number,
  scene: {
    readonly ground: Ground;
    readonly layout: Layout;
    readonly name: string;
  }
) => {
  stage.grounds.push({ frame, ground: scene.ground });
  stage.beats.push({ frame, layout: scene.layout, name: scene.name });
  stage.last.layout = scene.layout;
};

const cue = (stage: Stage, frame: number, kind: SmallSound) => {
  stage.cues.push({ atMs: msOfFrame(frame), kind, pan: 0 });
};

const ECHO: Readonly<Record<Ground, Readonly<Record<Tone, Tone>>>> = {
  Hot: { Cream: "Ink", Hot: "Ink", Ink: "Cream", Paper: "Ink", Sun: "Ink" },
  Ink: { Cream: "Hot", Hot: "Paper", Ink: "Hot", Paper: "Hot", Sun: "Hot" },
  Paper: { Cream: "Ink", Hot: "Ink", Ink: "Hot", Paper: "Ink", Sun: "Ink" },
};

const ON_GROUND: Readonly<Record<Ground, Tone>> = {
  Hot: "Cream",
  Ink: "Paper",
  Paper: "Ink",
};

const BIG_SIZE = 460;

const TYPE_ROOM = 980;

const TILT = -3;

interface TypeLook extends Rest {
  readonly entrance: Entrance;
  readonly ground: Ground;
  readonly size?: number;
  readonly still?: boolean;
  readonly tone: Tone;
  readonly twin?: boolean;
}

const echoKeys = (
  stage: Stage,
  span: Span,
  rest: Rest,
  still: boolean
): FilmKey[] => {
  const landed = Math.min(span.to - 1, span.from + SLAM_FRAMES + 1);
  const home = posed(rest);

  if (stage.calm || still || landed <= span.from) {
    return [key(span.from, home), gone(span.to, rest)];
  }

  const off = (by: number) =>
    posed(rest, { dx: rest.x + by, dy: rest.y - by * 0.7 });

  const jumps = stage.claps.flatMap((frame) =>
    frame > landed && frame + 2 < span.to
      ? [key(frame, off(-30), "Hold"), key(frame + 2, home, "Hold")]
      : []
  );

  return [
    key(span.from, off(-44)),
    key(landed, home),
    ...jumps,
    gone(span.to, rest),
  ];
};

const headline = (stage: Stage, text: string, span: Span, look: TypeLook) => {
  if (text.length === 0) {
    return;
  }

  const size = look.size ?? typeSize(text, TYPE_ROOM, BIG_SIZE);
  const scale = look.scale ?? 1;
  const lift = Math.max(5, Math.round(size * 0.04)) * scale;
  const turn = look.turn ?? TILT;
  const still = look.still === true;

  const behind = (tone: Tone, by: number) => {
    put(
      stage,
      halved(typeSprite(stage.palette, text, { size, tone })),
      echoKeys(
        stage,
        span,
        { scale: scale * 2, turn, x: look.x + by, y: look.y + by * 1.2 },
        still
      )
    );
  };

  if (look.twin === true) {
    behind("Sun", -lift);
  }

  behind(ECHO[look.ground][look.tone], lift);
  enter(
    stage,
    typeSprite(stage.palette, text, { size, tone: look.tone }),
    span,
    {
      entrance: still ? "Cut" : look.entrance,
      scale,
      turn,
      x: look.x,
      y: look.y,
    }
  );
};

const slip = (
  stage: Stage,
  text: string,
  span: Span,
  look: Rest & {
    readonly entrance?: Entrance;
    readonly size: number;
    readonly tone: Tone;
  }
) => {
  if (text.length === 0) {
    return;
  }

  enter(
    stage,
    slipSprite(stage.palette, text, { size: look.size, tone: look.tone }),
    span,
    { ...look, entrance: look.entrance ?? "Cut" }
  );
};

const face = (
  stage: Stage,
  person: DriftPerson,
  span: Span,
  look: Rest & { readonly entrance: Entrance; readonly expression: Expression }
) => {
  enter(
    stage,
    faceSprite(stage.palette, stage.theme, {
      avatar: person.avatar,
      expression: look.expression,
    }),
    span,
    look
  );
};

const flickered = (
  stage: Stage,
  person: DriftPerson,
  span: Span,
  look: Rest & { readonly expressions: readonly [Expression, Expression] }
) => {
  const every = Math.round(FRAMES_IN_BEAT / STEPS_IN_BEAT);
  const settle = Math.min(span.to, span.from + FRAMES_IN_BEAT);

  if (stage.calm) {
    face(stage, person, span, {
      ...look,
      entrance: "Cut",
      expression: look.expressions[1],
    });

    return;
  }

  for (const [index, expression] of look.expressions.entries()) {
    const keys: FilmKey[] = [];

    for (let frame = span.from; frame < settle; frame += every) {
      const shown = Math.floor((frame - span.from) / every) % 2 === index;

      keys.push(key(frame, posed(look, { opacity: shown ? 1 : 0 }), "Hold"));
    }

    keys.push(
      key(settle, posed(look, { opacity: index }), "Hold"),
      gone(span.to, look)
    );
    put(
      stage,
      faceSprite(stage.palette, stage.theme, {
        avatar: person.avatar,
        expression,
      }),
      keys
    );
  }
};

const card = (
  stage: Stage,
  text: string,
  span: Span,
  place: Rest & { readonly entrance: Entrance; readonly width: number }
) => {
  const hero = place.width > CARD_WIDTH;
  const drawn = hero ? HERO_WIDTH : CARD_WIDTH;

  enter(stage, cardSprite(stage.palette, text, drawn), span, {
    ...place,
    scale: place.width / drawn,
  });
};

const FAN = [-7, 6];

const hole = (
  stage: Stage,
  person: DriftPerson,
  span: Span,
  look: Rest & { readonly entrance: Entrance; readonly width: number }
) => {
  for (const [index, text] of person.hole.entries()) {
    card(stage, text, span, {
      entrance: look.entrance,
      turn: FAN[index] ?? 0,
      width: look.width,
      x: look.x + index * look.width * 0.78,
      y: look.y + index * look.width * 0.06,
    });
  }
};

interface Table {
  readonly cards: readonly CardItem[];
  readonly commons: number;
  readonly runs: number;
}

const STRIP_Y = 1497;

const STRIP_GAP = 8;

const stripWidth = (runs: number) => (runs > 1 ? 92 : 124);

const stripLeft = (runs: number, run: number) => {
  const row = stripWidth(runs) * 5 + STRIP_GAP * 4;
  const all = row * runs + 40 * (runs - 1);

  return FRAME.width / 2 - all / 2 + (run - 1) * (row + 40);
};

const runsOf = (table: Table, item: CardItem) =>
  item.slot < table.commons
    ? Array.from({ length: table.runs }, (_, index) => index + 1)
    : [item.run];

const strip = (stage: Stage, table: Table, span: Span) => {
  const width = stripWidth(table.runs);

  for (const item of table.cards) {
    for (const run of runsOf(table, item)) {
      card(stage, item.card, span, {
        entrance: "Cut",
        turn: ((item.slot * 7 + run * 3) % 5) - 2,
        width,
        x:
          stripLeft(table.runs, run) +
          item.slot * (width + STRIP_GAP) +
          width / 2,
        y: STRIP_Y,
      });
    }
  }
};

const fresh = (
  stage: Stage,
  text: string,
  span: Span,
  place: Rest & { readonly width: number }
) => {
  put(
    stage,
    blockSprite(fillOf(stage.palette, "Hot"), CARD_WIDTH),
    echoKeys(
      stage,
      span,
      {
        scale: place.width / CARD_WIDTH,
        turn: place.turn ?? 0,
        x: place.x + 14,
        y: place.y + 16,
      },
      false
    )
  );
  card(stage, text, span, { ...place, entrance: "Slam" });
};

const RAYS_AT = { x: CENTRE.x, y: 1060 };

const rays = (stage: Stage, span: Span, tone: Tone) => {
  if (stage.calm) {
    return;
  }

  put(stage, burstSprite(fillOf(stage.palette, tone)), [
    key(
      span.from,
      posed({ ...RAYS_AT, scale: BURST_SCALE, turn: 4 }, { opacity: 0.22 })
    ),
    gone(span.to, RAYS_AT),
  ]);
};

const SMALL_AT = { turn: -5, x: 330, y: 322 };

const BIG_AT = { x: CENTRE.x, y: 520 };

const FACE_AT = { x: 370, y: 1060 };

const HOLE_AT = { width: 250, x: 735, y: 1265 };

const FRESH_AT = { turn: 7, width: 360, x: 830, y: 1100 };

interface CloseLook {
  readonly big: string;
  readonly entrance: Entrance;
  readonly expression: Expression;
  readonly flicker?: readonly [Expression, Expression];
  readonly fresh?: CardItem;
  readonly ground: Ground;
  readonly hot?: boolean;
  readonly rays?: boolean;
  readonly small: string;
  readonly still?: boolean;
  readonly table?: Table;
  readonly tag?: string;
  readonly twin?: boolean;
}

const toneOn = (ground: Ground, hot: boolean): Tone =>
  hot && ground !== "Hot" ? "Hot" : ON_GROUND[ground];

const close = (
  stage: Stage,
  person: DriftPerson,
  span: Span,
  look: CloseLook
) => {
  if (look.rays === true) {
    rays(stage, span, look.ground === "Ink" ? "Hot" : "Ink");
  }

  headline(stage, look.big, span, {
    ...BIG_AT,
    entrance: look.entrance,
    ground: look.ground,
    still: look.still ?? false,
    tone: toneOn(look.ground, look.hot === true),
    twin: look.twin ?? false,
  });
  slip(stage, look.small, span, {
    ...SMALL_AT,
    size: 56,
    tone: look.ground === "Hot" ? "Ink" : "Hot",
  });

  if (look.flicker === undefined) {
    face(stage, person, span, {
      ...FACE_AT,
      entrance: look.entrance,
      expression: look.expression,
      turn: TILT,
    });
  } else {
    flickered(stage, person, span, {
      ...FACE_AT,
      expressions: look.flicker,
      turn: TILT,
    });
  }

  if (look.fresh === undefined) {
    hole(stage, person, span, {
      ...HOLE_AT,
      entrance: look.entrance === "Slam" ? "Rise" : "Cut",
    });
  } else {
    fresh(stage, look.fresh.card, span, FRESH_AT);
  }

  if (look.table !== undefined) {
    strip(stage, look.table, span);
  }

  if (look.tag !== undefined) {
    const half = Math.round((span.from + span.to) / 2);

    slip(
      stage,
      look.tag,
      { from: span.to - span.from > 8 ? half : span.from, to: span.to },
      { entrance: "Slam", size: 110, tone: "Sun", turn: 6, x: 800, y: 860 }
    );
  }
};

interface SoloLook {
  readonly big: string;
  readonly ground: Ground;
  readonly rays?: boolean;
  readonly small: string;
  readonly tag?: string;
  readonly twin?: boolean;
}

const solo = (stage: Stage, span: Span, look: SoloLook) => {
  if (look.rays === true) {
    rays(stage, span, look.ground === "Ink" ? "Hot" : "Ink");
  }

  slip(stage, look.small, span, {
    size: 84,
    tone: look.ground === "Hot" ? "Ink" : "Hot",
    turn: -4,
    x: CENTRE.x,
    y: 610,
  });
  headline(stage, look.big, span, {
    entrance: "Slam",
    ground: look.ground,
    tone: ON_GROUND[look.ground],
    twin: look.twin ?? false,
    x: CENTRE.x,
    y: 900,
  });

  if (look.tag !== undefined) {
    slip(stage, look.tag, span, {
      entrance: "Slam",
      size: 120,
      tone: "Sun",
      turn: 5,
      x: CENTRE.x,
      y: 1230,
    });
  }
};

const WIDE_ROW = [
  { turn: -4, x: 215, y: 960 },
  { turn: 2, x: 540, y: 940 },
  { turn: 5, x: 865, y: 965 },
];

const BOARDS: readonly {
  readonly slots: readonly Rest[];
  readonly width: number;
}[] = [
  { slots: [{ turn: 3, x: 540, y: 1090 }], width: 440 },
  {
    slots: [
      { turn: -4, x: 320, y: 1080 },
      { turn: 4, x: 760, y: 1095 },
    ],
    width: 380,
  },
  { slots: WIDE_ROW, width: 300 },
  {
    slots: [
      { turn: -4, x: 330, y: 950 },
      { turn: 3, x: 750, y: 960 },
      { turn: 3, x: 330, y: 1350 },
      { turn: -5, x: 750, y: 1360 },
    ],
    width: 300,
  },
  {
    slots: [
      ...WIDE_ROW,
      { turn: 3, x: 380, y: 1330 },
      { turn: -5, x: 705, y: 1345 },
    ],
    width: 300,
  },
];

interface BoardLook {
  readonly big: string;
  readonly fresh: CardItem;
  readonly small: string;
  readonly still: boolean;
}

const board = (stage: Stage, table: Table, span: Span, look: BoardLook) => {
  headline(stage, look.big, span, {
    entrance: "Slam",
    ground: "Paper",
    scale: 0.8,
    still: look.still,
    tone: "Ink",
    x: CENTRE.x,
    y: 500,
  });
  slip(stage, look.small, span, { ...SMALL_AT, size: 56, tone: "Hot", y: 296 });

  const shown = table.cards.filter((item) =>
    runsOf(table, item).includes(look.fresh.run)
  );

  const laid = BOARDS[shown.length - 1] ?? BOARDS.at(-1);

  for (const [index, item] of shown.entries()) {
    const place = laid?.slots[index];

    if (laid !== undefined && place !== undefined) {
      if (item === look.fresh) {
        fresh(stage, item.card, span, { ...place, width: laid.width });
      } else {
        card(stage, item.card, span, {
          ...place,
          entrance: "Cut",
          width: laid.width,
        });
      }
    }
  }
};

interface Side {
  readonly big: string;
  readonly expression: Expression;
  readonly person: DriftPerson;
}

const SPLIT_SCALE = 0.72;

const split = (stage: Stage, span: Span, sides: readonly [Side, Side]) => {
  const [first, second] = sides;

  enter(stage, halfSprite(fillOf(stage.palette, "Ink")), span, {
    entrance: "Cut",
    x: CENTRE.x,
    y: CENTRE.y,
  });
  face(stage, first.person, span, {
    entrance: "Slam",
    expression: first.expression,
    scale: SPLIT_SCALE,
    turn: TILT,
    x: 270,
    y: 650,
  });
  headline(stage, first.big, span, {
    entrance: "Slam",
    ground: "Paper",
    scale: 0.5,
    tone: "Ink",
    x: 780,
    y: 560,
  });
  slip(stage, first.person.name, span, {
    size: 56,
    tone: "Hot",
    turn: -4,
    x: 780,
    y: 380,
  });
  face(stage, second.person, span, {
    entrance: "Slam",
    expression: second.expression,
    scale: SPLIT_SCALE,
    turn: -TILT,
    x: 810,
    y: 1310,
  });
  headline(stage, second.big, span, {
    entrance: "Slam",
    ground: "Ink",
    scale: 0.5,
    tone: "Paper",
    turn: -TILT,
    x: 300,
    y: 1420,
  });
  slip(stage, second.person.name, span, {
    size: 56,
    tone: "Hot",
    turn: 4,
    x: 300,
    y: 1240,
  });
};

interface Telling {
  readonly stage: Stage;
  readonly table: { cards: CardItem[] };
  readonly told: DriftTold;
  readonly watched: SeatIndex | null;
}

const personOf = (told: DriftTold, seat: SeatIndex) =>
  told.people.find((each) => each.seat === seat) ?? told.lead;

const deal = (telling: Telling, item: CardItem, frame: number) => {
  telling.table.cards.push(item);
  telling.stage.dealt.push({ at: msOfFrame(frame), card: item.card });
};

const tableOf = (telling: Telling): Table => ({
  cards: telling.table.cards,
  commons: telling.told.commons,
  runs: telling.told.runs,
});

const percentFor = (
  told: DriftTold,
  seat: SeatIndex,
  odds: { readonly lead: number; readonly other: number }
) => (seat === told.lead.seat ? odds.lead : odds.other);

interface Tracked {
  readonly big: string;
  readonly seat: SeatIndex;
  readonly small: string;
}

const trackedAt = (
  told: DriftTold,
  item: CardItem,
  watched: SeatIndex | null
): Tracked => {
  if (item.odds === null || !told.numbers) {
    return {
      big: item.made,
      seat: told.lead.seat,
      small: item.made.length > 0 ? `${told.lead.name} HAS` : "",
    };
  }

  const ahead =
    item.odds.other > item.odds.lead && told.other !== null
      ? told.other.seat
      : told.lead.seat;

  const seat = watched ?? ahead;

  return {
    big: `${percentFor(told, seat, item.odds)}%`,
    seat,
    small: personOf(told, seat).name,
  };
};

const actScene = (telling: Telling, item: ActItem, span: Span) => {
  const { stage, told } = telling;
  const person = personOf(told, item.seat);
  const layout = picked(stage, ["Solo", "Close"]);
  const tag = item.word === "CALL" ? null : chipsText(item.amount);

  cut(stage, span.from, { ground: "Hot", layout, name: item.word });
  cue(stage, span.from, item.word === "ALL IN" ? "AllIn" : "Stamp");

  if (layout === "Solo") {
    const look = {
      big: item.word,
      ground: "Hot",
      rays: true,
      small: person.name,
    } as const;

    solo(stage, span, tag === null ? look : { ...look, tag });

    return;
  }

  const look: CloseLook = {
    big: item.word,
    entrance: "Slam",
    expression: "Resting",
    ground: "Hot",
    rays: true,
    small: person.name,
  };

  close(stage, person, span, tag === null ? look : { ...look, tag });
};

const NO_MOODS: ReadonlyMap<SeatIndex, Expression> = new Map();

const facingScene = (
  telling: Telling,
  item: CardItem,
  span: Span,
  moods: ReadonlyMap<SeatIndex, Expression>
) => {
  const { stage, told } = telling;
  const tracked = trackedAt(told, item, telling.watched);
  const { other } = told;

  if (item.odds === null || other === null || !told.numbers) {
    cut(stage, span.from, { ground: "Ink", layout: "Solo", name: tracked.big });
    solo(stage, span, {
      big: tracked.big,
      ground: "Ink",
      small: tracked.small,
    });

    return;
  }

  const facing = tracked.seat === told.lead.seat ? other : told.lead;
  const layout = picked(stage, ["Split", "Solo", "Close"]);
  const theirs = `${percentFor(told, facing.seat, item.odds)}%`;

  if (layout === "Split") {
    cut(stage, span.from, { ground: "Paper", layout, name: "both" });
    split(stage, span, [
      {
        big: tracked.big,
        expression: moods.get(tracked.seat) ?? "Resting",
        person: personOf(told, tracked.seat),
      },
      {
        big: theirs,
        expression: moods.get(facing.seat) ?? "Resting",
        person: facing,
      },
    ]);

    return;
  }

  cut(stage, span.from, { ground: "Ink", layout, name: facing.name });

  if (layout === "Solo") {
    solo(stage, span, { big: theirs, ground: "Ink", small: facing.name });

    return;
  }

  close(stage, facing, span, {
    big: theirs,
    entrance: "Slam",
    expression: moods.get(facing.seat) ?? "Resting",
    ground: "Ink",
    small: facing.name,
    table: tableOf(telling),
  });
};

const cardScene = (
  telling: Telling,
  item: CardItem,
  span: Span,
  given: ReadonlyMap<SeatIndex, Expression>
) => {
  const { stage, told } = telling;
  const tracked = trackedAt(told, item, telling.watched);
  const long = span.to - span.from >= FRAMES_IN_BEAT * 2;
  const quick = span.to - span.from < FRAMES_IN_BEAT;

  const first = long
    ? { from: span.from, to: span.from + FRAMES_IN_BEAT }
    : span;

  const layout = picked(stage, ["Board", "Close"]);

  const moods =
    told.decisive.kind === "Card" && told.decisive.item.run !== item.run
      ? NO_MOODS
      : given;

  deal(telling, item, span.from);
  cut(stage, span.from, { ground: "Paper", layout, name: item.card });
  cue(stage, span.from, "Card");

  if (layout === "Board") {
    board(stage, tableOf(telling), first, {
      big: tracked.big,
      fresh: item,
      small: tracked.small,
      still: quick,
    });
  } else {
    close(stage, personOf(told, tracked.seat), first, {
      big: tracked.big,
      entrance: quick ? "Cut" : "Slam",
      expression: moods.get(tracked.seat) ?? "Resting",
      fresh: item,
      ground: "Paper",
      small: tracked.small,
      still: quick,
      table: tableOf(telling),
    });
  }

  if (long) {
    facingScene(telling, item, { from: first.to, to: span.to }, moods);
  }
};

const itemScene = (
  telling: Telling,
  item: DriftItem,
  span: Span,
  moods: ReadonlyMap<SeatIndex, Expression>
) => {
  const { stage } = telling;

  if (item.kind === "Act") {
    actScene(telling, item, span);
  } else if (item.kind === "Card") {
    cardScene(telling, item, span, moods);
  } else {
    cut(stage, span.from, { ground: "Ink", layout: "Solo", name: item.word });
    cue(stage, span.from, "Stamp");
    solo(stage, span, {
      big: item.word,
      ground: "Ink",
      small: item.small,
      twin: true,
    });
  }
};

const HALVES = 2;

const durationsOf = (items: readonly DriftItem[], room: number) => {
  const halves = items.map(() => HALVES);
  const total = () => halves.reduce((sum, each) => sum + each, 0);

  for (const wanted of ["Card", "Note", "Act"]) {
    for (const [index, item] of items.entries()) {
      if (total() > room && item.kind === wanted) {
        halves[index] = 1;
      }
    }
  }

  for (const wanted of ["Act", "Card", "Note"]) {
    for (const [index, item] of items.entries()) {
      if (total() + HALVES <= room && item.kind === wanted) {
        halves[index] = (halves[index] ?? HALVES) + HALVES;
      }
    }
  }

  const last = halves.length - 1;

  if (last >= 0) {
    halves[last] = Math.max(1, (halves[last] ?? HALVES) + room - total());
  }

  return halves;
};

const MOST_ITEMS = 14;

const itemsLaid = (
  telling: Telling,
  items: readonly DriftItem[],
  span: {
    readonly beats: number;
    readonly from: number;
    readonly settles: boolean;
  },
  moods: ReadonlyMap<SeatIndex, Expression>
) => {
  const shown = items.slice(-Math.min(MOST_ITEMS, span.beats * HALVES));
  const halves = durationsOf(shown, span.beats * HALVES);
  let at = 0;

  for (const item of items.slice(0, items.length - shown.length)) {
    if (item.kind === "Card") {
      deal(telling, item, frameOfBeat(span.from));
    }
  }

  for (const [index, item] of shown.entries()) {
    const length = halves[index] ?? HALVES;

    if (span.settles && index === shown.length - 1) {
      telling.stage.last.layout = "Close";
    }

    itemScene(
      telling,
      item,
      {
        from: frameOfBeat(span.from + at / HALVES),
        to: frameOfBeat(span.from + (at + length) / HALVES),
      },
      moods
    );
    at += length;
  }
};

const hookScenes = (telling: Telling) => {
  const { stage, told } = telling;
  const count = Math.max(1, told.hook.length);

  for (const [index, hook] of told.hook.entries()) {
    const span = {
      from: frameOfBeat((index * BUILD_BEAT) / count),
      to: frameOfBeat(((index + 1) * BUILD_BEAT) / count),
    };

    const ground = index === 0 ? "Paper" : "Ink";

    cut(stage, span.from, { ground, layout: "Close", name: hook.big });
    close(stage, personOf(told, hook.seat), span, {
      big: hook.big,
      entrance: index === 0 ? "Cut" : "Slam",
      expression: "Resting",
      ground,
      hot: index === 0,
      small: hook.small,
      twin: index === 0,
    });
  }
};

const actorOf = (told: DriftTold) => {
  const { decisive } = told;

  if (decisive.kind === "Card") {
    return personOf(told, decisive.victim);
  }

  return decisive.kind === "None" ? told.lead : personOf(told, decisive.actor);
};

const heldWords = (telling: Telling) => {
  const { told } = telling;
  const made = telling.table.cards.at(-1)?.made ?? "";

  return made.length > 0
    ? { big: made, small: `${told.lead.name} HAS` }
    : { big: told.hook[0]?.big ?? "", small: told.hook[0]?.small ?? "" };
};

const rollHeadline = (telling: Telling) => {
  const { told } = telling;
  const { decisive } = told;
  const last = telling.table.cards.findLast((item) => item.odds !== null);

  const odds =
    last?.odds ?? (decisive.kind === "Card" ? decisive.before : null);

  if (decisive.kind === "Card" && odds !== null && told.numbers) {
    return {
      big: `${percentFor(told, decisive.victim, odds)}%`,
      small: personOf(told, decisive.victim).name,
    };
  }

  return decisive.kind === "Fold" || decisive.kind === "Call"
    ? { big: "CALL?", small: actorOf(told).name }
    : heldWords(telling);
};

const rollScene = (telling: Telling) => {
  const { stage, told } = telling;
  const words = rollHeadline(telling);
  const people = [told.lead, told.other ?? told.lead];

  const whole = {
    from: frameOfBeat(ROLL_BEAT),
    to: frameOfBeat(ROLL_BEAT + 1),
  };

  const steps = stage.calm ? 1 : STEPS_IN_BEAT;

  headline(stage, words.big, whole, {
    ...BIG_AT,
    entrance: "Cut",
    ground: "Paper",
    still: true,
    tone: "Ink",
  });
  slip(stage, words.small, whole, { ...SMALL_AT, size: 56, tone: "Hot" });

  for (let step = 0; step < steps; step += 1) {
    const span = {
      from: frameOfBeat(ROLL_BEAT + step / steps),
      to: frameOfBeat(ROLL_BEAT + (step + 1) / steps),
    };

    const person = stage.calm ? actorOf(told) : (people[step % 2] ?? told.lead);

    cut(stage, span.from, {
      ground: "Paper",
      layout: "Close",
      name: `roll ${step + 1}`,
    });
    face(stage, person, span, {
      ...FACE_AT,
      entrance: "Cut",
      expression: step % 2 === 0 ? "Resting" : "Thinking",
      turn: TILT,
    });
    hole(stage, person, span, { ...HOLE_AT, entrance: "Cut" });
    stage.hits.push({ frame: span.from, strength: 4 + step * 3 });
  }
};

const TRAILS = [
  { lag: 2, opacity: 0.34 },
  { lag: 4, opacity: 0.2 },
  { lag: 6, opacity: 0.1 },
];

const drifting = (
  stage: Stage,
  sprite: Sprite,
  span: Span,
  place: Rest & { readonly swing: number }
) => {
  const rushed = span.from + 4;
  const frozen = frameOfBeat(GAP_BEAT);
  const { swing } = place;

  const flight = (lag: number, opacity: number): FilmKey[] => [
    key(
      span.from + lag,
      posed(place, {
        dx: place.x + 520 * swing,
        dy: place.y - 420,
        opacity,
        turn: (place.turn ?? 0) + 26 * swing,
      })
    ),
    key(
      rushed + lag,
      posed(place, {
        dx: place.x + 90 * swing,
        dy: place.y - 70,
        opacity,
        turn: (place.turn ?? 0) + 9 * swing,
      })
    ),
    key(
      frozen,
      posed(place, {
        opacity,
        squeeze: 0.07,
        turn: (place.turn ?? 0) - 2 * swing,
      }),
      "Linear"
    ),
    gone(span.to, place),
  ];

  if (!stage.calm) {
    for (const trail of TRAILS.toReversed()) {
      put(stage, sprite, flight(trail.lag, trail.opacity));
    }
  }

  put(stage, sprite, flight(0, 1));
};

const WIND_UP_STEPS = [1.035, 1.07, 1.105];

const windUpScene = (telling: Telling) => {
  const { stage, told } = telling;
  const { decisive } = told;
  const span = { from: frameOfBeat(WIND_UP_BEAT), to: frameOfBeat(DROP_BEAT) };
  const actor = actorOf(told);

  cut(stage, span.from, { ground: "Ink", layout: "Close", name: "wind-up" });
  stage.beats.push({
    frame: frameOfBeat(GAP_BEAT),
    layout: "Close",
    name: "freeze",
  });

  for (const [index, scale] of WIND_UP_STEPS.entries()) {
    stage.steps.push({ frame: frameOfBeat(WIND_UP_BEAT + index), scale });
  }

  stage.steps.push({ frame: span.to, scale: 1 });
  face(stage, actor, span, {
    ...FACE_AT,
    entrance: "Cut",
    expression: "Thinking",
    turn: TILT,
  });
  strip(stage, tableOf(telling), span);

  const typed = {
    ...BIG_AT,
    entrance: "Cut",
    ground: "Ink",
    tone: "Paper",
  } as const;

  if (decisive.kind === "Card") {
    const counted = decisive.before !== null && told.numbers;
    const words = heldWords(telling);

    headline(
      stage,
      counted && decisive.before !== null
        ? `${percentFor(told, decisive.victim, decisive.before)}%`
        : words.big,
      span,
      typed
    );
    slip(stage, counted ? actor.name : words.small, span, {
      ...SMALL_AT,
      size: 56,
      tone: "Hot",
    });
    drifting(stage, cardSprite(stage.palette, "", CARD_WIDTH), span, {
      scale: FRESH_AT.width / CARD_WIDTH,
      swing: 1,
      x: FRESH_AT.x,
      y: FRESH_AT.y,
    });

    return;
  }

  if (decisive.kind === "None") {
    return;
  }

  headline(stage, chipsText(decisive.amount), span, typed);
  slip(stage, `${actor.name} TO CALL`, span, {
    ...SMALL_AT,
    size: 56,
    tone: "Hot",
  });

  for (const [index, swing] of [1, -1].entries()) {
    drifting(
      stage,
      cardSprite(stage.palette, actor.hole[index] ?? "", CARD_WIDTH),
      span,
      {
        scale: HOLE_AT.width / CARD_WIDTH,
        swing: swing * 0.4,
        turn: FAN[index] ?? 0,
        x: HOLE_AT.x + index * HOLE_AT.width * 0.78,
        y: HOLE_AT.y + index * 15,
      }
    );
  }
};

const BURST_FRAMES = 4;

const impactAt = (stage: Stage, frame: number) => {
  if (stage.calm) {
    return;
  }

  put(stage, bandSprite(fillOf(stage.palette, "Sun")), [
    key(frame, posed({ x: CENTRE.x - 200, y: 700 })),
    key(
      frame + BURST_FRAMES,
      posed({ x: CENTRE.x + 240, y: 700 }, { opacity: 0 }),
      "Linear"
    ),
  ]);
  stage.hits.push({ frame, strength: 30 });
};

const DROP_AT = { turn: 4, width: HERO_WIDTH, x: CENTRE.x, y: 1124 };

const dropScene = (telling: Telling, span: Span) => {
  const { stage, told } = telling;
  const { decisive } = told;

  cut(stage, span.from, { ground: "Paper", layout: "Drop", name: "DROP" });
  impactAt(stage, span.from);
  rays(stage, span, "Ink");

  const worded = {
    ...BIG_AT,
    entrance: "Slam",
    ground: "Paper",
    tone: "Hot",
    twin: true,
  } as const;

  if (decisive.kind === "Card") {
    deal(telling, decisive.item, span.from);
    cue(stage, span.from, "Card");
    headline(stage, decisive.split ? "CHOP" : decisive.word, span, worded);

    for (const [tone, by] of [
      ["Sun", -16],
      ["Hot", 18],
    ] as const) {
      put(
        stage,
        blockSprite(fillOf(stage.palette, tone), CARD_WIDTH),
        echoKeys(
          stage,
          span,
          {
            scale: HERO_WIDTH / CARD_WIDTH,
            turn: DROP_AT.turn,
            x: DROP_AT.x + by,
            y: DROP_AT.y + by,
          },
          false
        )
      );
    }

    card(stage, decisive.item.card, span, { ...DROP_AT, entrance: "Slam" });

    return;
  }

  if (decisive.kind === "None") {
    headline(stage, decisive.word, span, { ...worded, y: 900 });

    return;
  }

  const actor = actorOf(told);
  const folding = decisive.kind === "Fold";

  cue(stage, span.from, folding ? "Fold" : "Stamp");
  headline(stage, folding ? "FOLD" : "CALL", span, worded);
  slip(stage, actor.name, span, { ...SMALL_AT, size: 56, tone: "Ink" });
  face(stage, actor, span, {
    ...FACE_AT,
    entrance: "Slam",
    expression: folding ? "Folded" : "Resting",
    turn: TILT,
  });

  for (const [index, swing] of [1, -1].entries()) {
    const place = {
      scale: HOLE_AT.width / CARD_WIDTH,
      turn: FAN[index] ?? 0,
      x: HOLE_AT.x + index * HOLE_AT.width * 0.78,
      y: HOLE_AT.y + index * 15,
    };

    put(stage, cardSprite(stage.palette, actor.hole[index] ?? "", CARD_WIDTH), [
      key(span.from, posed(place)),
      key(
        span.to,
        folding && !stage.calm
          ? posed(place, {
              dx: place.x + 500 * swing,
              dy: place.y + 700,
              opacity: 0.6,
              turn: 70 * swing,
            })
          : posed(place),
        "In"
      ),
      gone(span.to, place),
    ]);
  }
};

const revealScene = (telling: Telling, span: Span) => {
  const { stage, told } = telling;
  const { decisive } = told;
  const { other } = told;

  stage.hits.push({ frame: span.from, strength: 12 });

  if (decisive.kind === "Card" && decisive.split && other !== null) {
    cut(stage, span.from, { ground: "Paper", layout: "Split", name: "reveal" });
    split(stage, span, [
      { big: decisive.word, expression: "Happy", person: told.lead },
      { big: decisive.word, expression: "Happy", person: other },
    ]);

    return;
  }

  if (decisive.kind === "Card" && decisive.item.odds !== null) {
    const gainer = personOf(told, decisive.gainer);
    const layout = picked(stage, ["Solo", "Close"]);
    const big = `${percentFor(told, decisive.gainer, decisive.item.odds)}%`;

    cut(stage, span.from, { ground: "Hot", layout, name: "reveal" });

    if (layout === "Solo") {
      solo(stage, span, {
        big,
        ground: "Hot",
        rays: true,
        small: gainer.name,
        twin: true,
      });
    } else {
      close(stage, gainer, span, {
        big,
        entrance: "Slam",
        expression: "Happy",
        ground: "Hot",
        rays: true,
        small: gainer.name,
        twin: true,
      });
    }

    return;
  }

  cut(stage, span.from, { ground: "Hot", layout: "Cards", name: "reveal" });

  if (decisive.kind !== "Fold" && decisive.kind !== "Call") {
    return;
  }

  const shown = personOf(told, decisive.reveal.seat);

  headline(stage, decisive.reveal.word, span, {
    ...BIG_AT,
    entrance: "Slam",
    ground: "Hot",
    tone: "Cream",
    twin: true,
  });
  slip(stage, `${shown.name} HAD`, span, {
    ...SMALL_AT,
    size: 56,
    tone: "Ink",
  });

  for (const [index, text] of shown.hole.entries()) {
    card(stage, text, span, {
      entrance: "Slam",
      turn: FAN[index] ?? 0,
      width: HERO_WIDTH * 0.73,
      x: 340 + index * 400,
      y: 1070 + index * 30,
    });
    cue(stage, span.from, "Card");
  }
};

const reactionScene = (telling: Telling, span: Span) => {
  const { stage, told } = telling;
  const { decisive } = told;

  if (decisive.kind === "Card" && decisive.split) {
    cut(stage, span.from, { ground: "Ink", layout: "Solo", name: "reaction" });
    solo(stage, span, { big: "SPLIT IT", ground: "Ink", small: "SAME HAND" });

    return;
  }

  cut(stage, span.from, { ground: "Ink", layout: "Close", name: "reaction" });

  if (decisive.kind === "Card") {
    const victim = personOf(told, decisive.victim);

    close(stage, victim, span, {
      big:
        decisive.item.odds === null
          ? ""
          : `${percentFor(told, decisive.victim, decisive.item.odds)}%`,
      entrance: "Cut",
      expression: "Gutted",
      flicker: ["Resting", "Gutted"],
      ground: "Ink",
      small: victim.name,
    });

    return;
  }

  close(stage, told.lead, span, {
    big: told.lead.name,
    entrance: "Cut",
    expression: "Happy",
    flicker: ["LookingDown", "Happy"],
    ground: "Ink",
    hot: true,
    small: "",
  });
};

const COUNT_EVERY = 3;

const COUNT_BEATS = 1.5;

const counted = (stage: Stage, amount: number, span: Span) => {
  const settle = Math.min(
    span.to,
    span.from + Math.round(FRAMES_IN_BEAT * COUNT_BEATS)
  );

  const steps = stage.calm
    ? 0
    : Math.max(1, Math.floor((settle - span.from) / COUNT_EVERY));

  const size = typeSize(chipsText(amount), TYPE_ROOM, BIG_SIZE);
  const floor = 10 ** (String(Math.trunc(amount)).length - 1);

  for (let step = 0; step < steps; step += 1) {
    const from = span.from + step * COUNT_EVERY;

    const shown = Math.round(
      floor + ((amount - floor) * (step + 1) ** 2) / (steps + 1) ** 2
    );

    put(
      stage,
      halved(
        typeSprite(stage.palette, chipsText(shown), { size, tone: "Hot" })
      ),
      [
        key(from, posed({ ...BIG_AT, scale: 2, turn: TILT })),
        gone(from + COUNT_EVERY, BIG_AT),
      ]
    );
  }

  headline(
    stage,
    chipsText(amount),
    { from: span.from + steps * COUNT_EVERY, to: span.to },
    {
      ...BIG_AT,
      entrance: "Slam",
      ground: "Paper",
      size,
      tone: "Hot",
      twin: true,
    }
  );
  cue(stage, span.from, "Chips");
};

const potScene = (telling: Telling, span: Span) => {
  const { stage, told } = telling;
  const [first, second] = told.payoff;

  cut(stage, span.from, { ground: "Paper", layout: "Pot", name: "pot" });

  if (first !== undefined && second === undefined) {
    const winner = personOf(told, first.seat);

    counted(stage, first.amount, span);
    slip(stage, `${winner.name} TAKES`, span, {
      ...SMALL_AT,
      size: 56,
      tone: "Ink",
    });
    face(stage, winner, span, {
      ...FACE_AT,
      entrance: "Slam",
      expression: "Happy",
      turn: TILT,
    });
    hole(stage, winner, span, { ...HOLE_AT, entrance: "Rise" });
    strip(stage, tableOf(telling), span);

    if (told.bounty !== null) {
      slip(stage, `BOUNTY +${chipsText(told.bounty.amount)}`, span, {
        entrance: "Slam",
        size: 84,
        tone: "Sun",
        turn: 5,
        x: 720,
        y: 830,
      });
    }

    return;
  }

  headline(stage, told.runs > 1 ? "ONE EACH" : "SPLIT", span, {
    ...BIG_AT,
    entrance: "Slam",
    ground: "Paper",
    tone: "Hot",
    twin: true,
  });
  slip(
    stage,
    first === undefined ? "" : `${chipsText(first.amount)} EACH`,
    span,
    { ...SMALL_AT, size: 56, tone: "Ink" }
  );

  for (const [index, share] of told.payoff.slice(0, 2).entries()) {
    face(stage, personOf(told, share.seat), span, {
      entrance: "Slam",
      expression: "Happy",
      scale: 0.7,
      turn: index === 0 ? TILT : -TILT,
      x: 300 + index * 480,
      y: 1010,
    });
  }

  strip(stage, tableOf(telling), span);
};

const keptScene = (stage: Stage, look: DriftLook, span: Span) => {
  const sprite = pictureSprite(look.kept.svg, look.kept.shows);

  cut(stage, span.from, { ground: "Paper", layout: "Card", name: "card" });
  cue(stage, span.from, "Stamp");
  stage.shots.push({
    ...sprite,
    keys: stage.calm
      ? [key(span.from, REST)]
      : [
          key(span.from, { ...REST, scale: 1.2 }),
          key(span.from + SLAM_FRAMES, REST),
        ],
    pivot: CENTRE,
  });
};

const SHAKES = [1, -0.8, 0.62, -0.4, 0.22, -0.1];

const PUNCHES = [1, 0.35];

const kickFrames = (stage: Stage) => {
  const frames = new Map<number, number>();

  for (const punch of stage.punches) {
    for (let bar = punch.span.from; bar < punch.span.to; bar += BEATS_IN_BAR) {
      for (const step of KICK_STEPS) {
        const beat = bar + step / STEPS_IN_BEAT;

        if (beat < punch.span.to) {
          frames.set(frameOfBeat(beat), punch.by);
        }
      }
    }
  }

  return frames;
};

const cameraOf = (stage: Stage, frames: number): readonly FilmKey[] => {
  if (stage.calm) {
    return [];
  }

  const kicks = kickFrames(stage);
  const keys: FilmKey[] = [];
  let before = "";
  let held = 1;

  for (let frame = 0; frame < frames; frame += 1) {
    held = stage.steps.find((step) => step.frame === frame)?.scale ?? held;

    let scale = held;
    let dx = 0;
    let dy = 0;

    for (const [back, share] of PUNCHES.entries()) {
      scale *= 1 + (kicks.get(frame - back) ?? 0) * share;
    }

    for (const hit of stage.hits) {
      const sway = SHAKES[frame - hit.frame];

      if (sway !== undefined) {
        dx += sway * hit.strength;
        dy += (SHAKES[frame - hit.frame + 1] ?? 0) * hit.strength * 0.7;
      }
    }

    const now = `${scale}:${dx}:${dy}`;

    if (now !== before) {
      keys.push(key(frame, { ...REST, dx, dy, scale }, "Hold"));
      before = now;
    }
  }

  return keys;
};

const clapFrames = (from: number, to: number) => {
  const frames: number[] = [];

  for (let bar = from; bar < to; bar += BEATS_IN_BAR) {
    for (const step of CLAP_STEPS) {
      frames.push(frameOfBeat(bar + step / STEPS_IN_BEAT));
    }
  }

  return frames;
};

const GROUNDS: readonly Ground[] = ["Paper", "Ink", "Hot"];

const groundShots = (stage: Stage, frames: number): readonly DriftShot[] => {
  const ordered = stage.grounds.toSorted(
    (left, right) => left.frame - right.frame
  );

  const laid = posed({ ...CENTRE, scale: GROUND_SCALE });

  return GROUNDS.map((ground) => ({
    ...groundSprite(fillOf(stage.palette, ground)),
    keys: [
      ...ordered.map((each) =>
        key(
          each.frame,
          each.ground === ground ? laid : { ...laid, opacity: 0 },
          "Hold"
        )
      ),
      key(frames, { ...laid, opacity: 0 }, "Hold"),
    ],
    pinned: true,
    pivot: ORIGIN,
  }));
};

const afterBeats = (told: DriftTold) => {
  const cards = told.after.filter((item) => item.kind === "Card").length;
  const others = told.after.length - cards;

  return Math.min(
    BEATS_IN_BAR * 2,
    others + (cards > 3 ? Math.ceil(cards / HALVES) : cards)
  );
};

export const driftPlan = (told: DriftTold, look: DriftLook): DriftPlan => {
  const reveal = told.decisive.kind === "None" ? 0 : 1;
  const after = afterBeats(told);
  const spoken = 1 + reveal + REACTION_BEATS + after + POT_BEATS + CARD_BEATS;
  const beats = DROP_BEAT + Math.ceil(spoken / BEATS_IN_BAR) * BEATS_IN_BAR;
  const frames = frameOfBeat(beats);
  const cardBeat = beats - CARD_BEATS;
  const reactionBeat = DROP_BEAT + 1 + reveal;
  const potBeat = reactionBeat + REACTION_BEATS + after;

  const stage: Stage = {
    beats: [],
    calm: look.calm,
    claps: [
      ...clapFrames(BUILD_BEAT, WIND_UP_BEAT),
      ...clapFrames(DROP_BEAT, cardBeat),
    ],
    cues: [],
    dealt: [],
    grounds: [],
    hits: [],
    last: { layout: "Card" },
    palette: paletteFor(look.theme, look.deck),
    punches: [
      { by: 0.045, span: { from: BUILD_BEAT, to: ROLL_BEAT } },
      { by: 0.07, span: { from: DROP_BEAT, to: cardBeat } },
    ],
    shots: [],
    steps: [],
    theme: look.theme,
  };

  const telling: Telling = {
    stage,
    table: { cards: [] },
    told,
    watched: told.decisive.kind === "Card" ? told.decisive.victim : null,
  };

  hookScenes(telling);
  itemsLaid(
    telling,
    told.build,
    { beats: ROLL_BEAT - BUILD_BEAT, from: BUILD_BEAT, settles: true },
    NO_MOODS
  );
  rollScene(telling);
  windUpScene(telling);
  dropScene(telling, {
    from: frameOfBeat(DROP_BEAT),
    to: frameOfBeat(DROP_BEAT + 1),
  });

  if (reveal === 1) {
    revealScene(telling, {
      from: frameOfBeat(DROP_BEAT + 1),
      to: frameOfBeat(DROP_BEAT + 2),
    });
  }

  reactionScene(telling, {
    from: frameOfBeat(reactionBeat),
    to: frameOfBeat(reactionBeat + REACTION_BEATS),
  });
  itemsLaid(
    { ...telling, watched: null },
    told.after,
    { beats: after, from: reactionBeat + REACTION_BEATS, settles: false },
    new Map<SeatIndex, Expression>(
      told.decisive.kind === "Card" && !told.decisive.split
        ? [
            [told.decisive.victim, "Gutted"],
            [told.decisive.gainer, "Happy"],
          ]
        : []
    )
  );
  potScene(telling, { from: frameOfBeat(potBeat), to: frameOfBeat(cardBeat) });
  keptScene(stage, look, { from: frameOfBeat(cardBeat), to: frames });

  const cuts = stage.beats.toSorted((left, right) => left.frame - right.frame);
  const kept = stage.shots.at(-1);

  return {
    beats: cuts.map((each, index) => ({
      at: msOfFrame(each.frame),
      hold: msOfFrame((cuts[index + 1]?.frame ?? frames) - each.frame),
      layout: each.layout,
      name: each.name,
    })),
    camera: cameraOf(stage, frames),
    cardAt: msOfFrame(frameOfBeat(cardBeat)),
    dealt: stage.dealt,
    dropAt: msOfFrame(frameOfBeat(DROP_BEAT)),
    length: msOfFrame(frames),
    sheet: {
      cues: stage.cues.toSorted((left, right) => left.atMs - right.atMs),
      hitMs: msOfFrame(frameOfBeat(DROP_BEAT)),
      lengthMs: msOfFrame(frames),
      outcome: told.outcome,
      pauseMs: msOfFrame(frameOfBeat(WIND_UP_BEAT)),
      resultMs: msOfFrame(frameOfBeat(potBeat)),
      seed: look.seed,
      tagMs: msOfFrame(frameOfBeat(cardBeat)),
    },
    shots: [
      ...groundShots(stage, frames),
      ...stage.shots.slice(0, -1),
      ...(kept === undefined ? [] : [kept]),
    ],
  };
};
