import type { Theme, Deck } from "../model.js";
import { FRAME_SIZES, paletteFor, sheet } from "../pictures/paper.js";
import type { KeptFrame, Palette } from "../pictures/paper.js";
import { wrapped } from "../pictures/text-fit.js";
import type { Box, FilmKey, Pose, Shot } from "./film.js";
import {
  DISPLAY,
  boardCardArt,
  boardSpots,
  footY,
  geometryFor,
  geometryOf,
  linesArt,
  panelArt,
  panelBoxes,
  pictureParts,
  potArt,
  tabArt,
} from "./picture.js";
import type { Drawn, PicturePart } from "./picture.js";
import type { MomentStory } from "./scene.js";
import type { MomentPicture } from "./schema.js";
import { FAMILIES } from "./score.js";
import type { Family } from "./score.js";
import type { Outcome, ScoreSheet, SmallCue } from "./sound/sheet.js";
import { REST } from "./timeline.js";

export const BEATS = {
  bet: 1600,
  count: 6400,
  end: 10_500,
  hit: 5200,
  land: 600,
  pause: 3200,
  tag: 7600,
} as const;

export interface BuildShot extends Shot {
  readonly shows: readonly string[];
}

export interface BuildPlan {
  readonly camera: readonly FilmKey[];
  readonly dealt: readonly { readonly at: number; readonly card: string }[];
  readonly length: number;
  readonly sheet: ScoreSheet;
  readonly shots: readonly BuildShot[];
}

export interface BuildLook {
  readonly calm: boolean;
  readonly deck: Deck;
  readonly frame: KeptFrame;
  readonly theme: Theme;
}

const HIDDEN: Pose = { ...REST, opacity: 0 };

const FADE_MS = 180;

type Keys = readonly FilmKey[];

const fadeIn = (at: number, length = FADE_MS): Keys => [
  { at, pose: HIDDEN },
  { at: at + length, ease: "Out", pose: REST },
];

const from = (at: number): Keys => [{ at, ease: "Hold", pose: REST }];

const slam = (at: number, calm: boolean): Keys =>
  calm
    ? fadeIn(at)
    : [
        { at, pose: { ...HIDDEN, scale: 1.5 } },
        { at: at + 70, ease: "Linear", pose: { ...REST, scale: 1.18 } },
        { at: at + 240, ease: "Out", pose: REST },
      ];

const slideIn = (at: number, dx: number, dy: number, calm: boolean): Keys =>
  calm
    ? fadeIn(at, 300)
    : [
        { at, pose: { ...HIDDEN, dx, dy } },
        { at: at + 440, ease: "Out", pose: REST },
      ];

const drop = (at: number, calm: boolean): Keys =>
  calm
    ? fadeIn(at)
    : [
        { at, pose: { ...HIDDEN, dy: -90, turn: -6 } },
        { at: at + 90, ease: "Linear", pose: { ...REST, dy: -30, turn: -2 } },
        { at: at + 260, ease: "Out", pose: REST },
      ];

const flipUp = (at: number, calm: boolean): Keys =>
  calm
    ? fadeIn(at)
    : [
        { at, pose: { ...REST, squeeze: 0.02 } },
        { at: at + 170, ease: "Out", pose: REST },
      ];

const until = (keys: Keys, at: number, flip = false): Keys => [
  ...keys.filter((key) => key.at < at),
  { at, ease: "Hold", pose: REST },
  {
    at: at + (flip ? 170 : FADE_MS),
    ease: "In",
    pose: flip ? { ...REST, squeeze: 0.02 } : HIDDEN,
  },
  { at: at + (flip ? 171 : FADE_MS + 1), ease: "Hold", pose: HIDDEN },
];

const shot = (
  art: Drawn,
  keys: Keys,
  shows: readonly string[] = []
): BuildShot => ({
  art: art.svg,
  box: art.box,
  keys,
  shows,
});

const baseArt = (palette: Palette, frame: KeptFrame): Drawn => {
  const { height, width } = FRAME_SIZES[frame];

  return {
    box: { height, width, x: 0, y: 0 },
    svg: [
      `<rect x="0" y="0" width="${width}" height="${height}" fill="${palette.page}"/>`,
      sheet(palette, {
        fill: palette.felt,
        height: height - 96,
        lift: 5,
        radius: 44,
        width: width - 96,
        x: 48,
        y: 48,
      }),
    ].join(""),
  };
};

const captionArt = (
  palette: Palette,
  frame: KeptFrame,
  text: string
): Drawn => {
  const story = frame === "Story";
  const size = story ? 76 : 66;
  const { top } = geometryOf(frame);
  const lines = wrapped(text, size * 0.93, 888, 3);

  return linesArt(92, top + (story ? 150 : 132), lines, {
    family: DISPLAY,
    fill: palette.ink,
    leading: size * 1.1,
    size,
    spacing: -size * 0.03,
    weight: 800,
  });
};

const OUTCOMES = {
  Celebration: "Win",
  Groan: "Loss",
  Relief: "Split",
  Reveal: "Win",
} as const satisfies Readonly<Record<Family, Outcome>>;

export const outcomeOf = (picture: Pick<MomentPicture, "kind">): Outcome =>
  OUTCOMES[FAMILIES[picture.kind]];

const COUNT_STEPS = 6;

const countedAmounts = (start: number, end: number): readonly number[] =>
  start === end
    ? [end]
    : Array.from({ length: COUNT_STEPS }, (_, index) =>
        index === COUNT_STEPS - 1
          ? end
          : start + Math.trunc(((end - start) * (index + 1)) / COUNT_STEPS)
      );

const potShots = (
  palette: Palette,
  final: PicturePart | undefined,
  place: { readonly x: number; readonly y: number },
  stages: readonly { readonly amount: number; readonly at: number }[]
): readonly BuildShot[] => {
  const shots: BuildShot[] = [];
  const steps: { amount: number; at: number }[] = [];
  let previous = 0;

  for (const stage of stages) {
    const amounts = countedAmounts(
      previous === 0 ? stage.amount : previous,
      stage.amount
    );

    for (const [index, amount] of amounts.entries()) {
      steps.push({ amount, at: stage.at + index * 70 });
    }

    previous = stage.amount;
  }

  const kept = steps.filter(
    (step, index) =>
      steps.findIndex((other) => other.amount === step.amount) === index
  );

  for (const [index, step] of kept.entries()) {
    const next = kept[index + 1];
    const last = next === undefined;

    const art =
      last && final !== undefined
        ? final
        : potArt(palette, { pot: step.amount, x: place.x, y: place.y });

    const keys = index === 0 && step.at > 0 ? fadeIn(step.at) : from(step.at);

    shots.push(shot(art, last ? keys : until(keys, next.at - 1)));
  }

  return shots;
};

const cueAt = (atMs: number, kind: SmallCue["kind"], pan = 0): SmallCue => ({
  atMs,
  kind,
  pan,
});

const spread = (count: number, start: number, end: number, apart: number) =>
  Array.from(
    { length: count },
    (_, index) =>
      start +
      Math.round(index * Math.min(apart, (end - start) / Math.max(1, count)))
  );

interface Staged {
  readonly boxes: readonly Box[];
  readonly calm: boolean;
  readonly first: number;
  readonly frame: KeptFrame;
  readonly geometry: ReturnType<typeof geometryFor>;
  readonly palette: Palette;
  readonly partOf: (role: string, index?: number) => PicturePart | undefined;
  readonly picture: MomentPicture;
  readonly solo: boolean;
  readonly story: MomentStory;
  readonly theme: Theme;
}

interface Laid {
  readonly cues: readonly SmallCue[];
  readonly shots: readonly BuildShot[];
}

const awayOf = (staged: Staged, index: number) =>
  staged.frame === "Story"
    ? { dx: 0, dy: 160 }
    : { dx: index === 0 ? -140 : 140, dy: 0 };

const revealAtOf = (staged: Staged, index: number) =>
  index === staged.first && staged.story.answer === "Fold"
    ? BEATS.hit + 500
    : BEATS.hit;

const LATE_ROLES: readonly (readonly [string, number])[] = [
  ["wins", 60],
  ["hand", 120],
  ["swing", 260],
  ["note", 420],
];

const holeShots = (
  staged: Staged,
  index: number,
  enter: Keys,
  early: Drawn
): Laid => {
  const seat = staged.picture.seats[index];
  const hole = staged.partOf("hole", index);

  if (seat === undefined || hole === undefined) {
    return { cues: [], shots: [] };
  }

  const faceDownFirst =
    index === staged.first ? staged.story.hiddenFirst : seat.cards.length > 0;

  if (!faceDownFirst || seat.cards.length === 0) {
    return { cues: [], shots: [shot(hole, enter, seat.cards)] };
  }

  const revealAt = revealAtOf(staged, index);

  return {
    cues: [cueAt(revealAt, "Card", index === 0 ? -0.3 : 0.3)],
    shots: [
      shot(early, until(enter, revealAt - 170, true)),
      shot(hole, flipUp(revealAt, staged.calm), seat.cards),
    ],
  };
};

const seatShots = (staged: Staged, index: number): Laid => {
  const seat = staged.picture.seats[index];

  if (seat === undefined) {
    return { cues: [], shots: [] };
  }

  const { geometry, palette } = staged;
  const box = staged.boxes[index] ?? geometry.solo;
  const arrives = index === staged.first ? 0 : BEATS.pause;
  const away = awayOf(staged, index);
  const winners = staged.picture.seats.filter((each) => each.won).length;

  const early = panelArt(
    palette,
    staged.theme,
    seat,
    { box, tall: geometry.tall || staged.solo, tagged: winners === 1 },
    { faceDown: true, result: false }
  );

  const enter =
    arrives === 0 ? from(0) : slideIn(arrives, away.dx, away.dy, staged.calm);

  const finals = (role: string) => {
    const art = staged.partOf(role, index);

    return art === undefined ? [] : [art];
  };

  const holes = holeShots(staged, index, enter, early.hole);

  return {
    cues: holes.cues,
    shots: [
      ...finals("panel").map((art) => shot(art, enter)),
      shot(early.face, until(enter, BEATS.count - 1)),
      ...finals("face").map((art) => shot(art, fadeIn(BEATS.count))),
      ...finals("name").map((art) => shot(art, enter)),
      ...holes.shots,
      ...LATE_ROLES.flatMap(([role, after]) =>
        finals(role).map((art) => {
          const at = BEATS.count + after + (role === "wins" ? 0 : index * 140);

          return shot(
            art,
            role === "wins" ? slam(at, staged.calm) : fadeIn(at)
          );
        })
      ),
    ],
  };
};

const hookLanding = (index: number, hookCount: number) =>
  index === hookCount - 1 && hookCount >= 3 ? BEATS.land : 0;

const boardShots = (
  staged: Staged
): Laid & { readonly dealt: BuildPlan["dealt"] } => {
  const { palette, picture, story } = staged;
  const spots = boardSpots(picture, staged.geometry);
  const order = [...new Set(story.dealt.map((dealt) => dealt.card))];
  const hookCount = Math.min(story.hookCards, order.length);

  const runTimes = spread(
    order.length - hookCount,
    BEATS.hit + 320,
    BEATS.count - 260,
    300
  );

  const landOf = (card: string) => {
    const index = order.indexOf(card);

    if (index === -1) {
      return 0;
    }

    return index < hookCount
      ? hookLanding(index, hookCount)
      : (runTimes[index - hookCount] ?? BEATS.count - 260);
  };

  const dealt = order.map((card) => ({ at: landOf(card), card }));

  const shots = spots.flatMap((spot) => {
    const lands = landOf(spot.card);
    const plain = boardCardArt(palette, picture, spot, false);
    const final = staged.partOf("board", spot.index);
    const entry = lands === 0 ? from(0) : drop(lands, staged.calm);

    if (final === undefined || final.svg === plain.svg) {
      return [shot(final ?? plain, entry, [spot.card])];
    }

    return [
      shot(plain, until(entry, BEATS.count), [spot.card]),
      shot(final, fadeIn(BEATS.count), [spot.card]),
    ];
  });

  const flag = staged.partOf("flag");
  const flagged = dealt.find((each) => each.card === picture.flag?.card);

  return {
    cues: dealt.flatMap(({ at }) => (at > 0 ? [cueAt(at, "Card", 0)] : [])),
    dealt,
    shots: [
      ...shots,
      ...(flag === undefined
        ? []
        : [
            shot(
              flag,
              slam(Math.max(BEATS.count, (flagged?.at ?? 0) + 120), staged.calm)
            ),
          ]),
    ],
  };
};

const cornerTab = (staged: Staged, index: number, text: string) => {
  const box = staged.boxes[index] ?? staged.geometry.solo;

  return tabArt(staged.palette, {
    anchor: "end",
    fill: staged.palette.ink,
    ink: staged.palette.page,
    size: staged.frame === "Story" ? 26 : 22,
    text,
    turn: 3,
    x: box.x + box.width - 16,
    y: box.y - 20,
  });
};

const actionShots = (staged: Staged): Laid => {
  const { story } = staged;

  const bet: Laid =
    story.betTab.length === 0
      ? { cues: [], shots: [] }
      : {
          cues: [
            cueAt(
              BEATS.bet + 100,
              story.betTab.startsWith("ALL IN") ? "AllIn" : "Chips"
            ),
            cueAt(BEATS.bet + 260, "Chips"),
          ],
          shots: [
            shot(
              cornerTab(staged, staged.first, story.betTab),
              until(slam(BEATS.bet + 100, staged.calm), BEATS.count - 1)
            ),
          ],
        };

  const answered = !staged.solo && story.answer !== "None";
  const called = story.answer === "Call";

  const answer: Laid = answered
    ? {
        cues: [cueAt(BEATS.hit + 40, called ? "Chips" : "Fold")],
        shots: [
          shot(
            cornerTab(staged, 1 - staged.first, called ? "CALL" : "FOLD"),
            until(slam(BEATS.hit, staged.calm), BEATS.count - 1)
          ),
        ],
      }
    : { cues: [], shots: [] };

  return {
    cues: [...bet.cues, ...answer.cues],
    shots: [...bet.shots, ...answer.shots],
  };
};

const potStagesOf = (staged: Staged) => [
  ...(staged.story.pots.hook > 0
    ? [{ amount: staged.story.pots.hook, at: 0 }]
    : []),
  ...(staged.story.betTab.length > 0
    ? [{ amount: staged.story.pots.bet, at: BEATS.bet + 200 }]
    : []),
  { amount: staged.picture.pot, at: BEATS.hit + 200 },
];

const captionShots = (staged: Staged): readonly BuildShot[] => {
  const { picture, story } = staged;

  const captions: readonly (readonly [string, number, number])[] = [
    [story.hook, 0, BEATS.bet],
    [story.bet, BEATS.bet, BEATS.pause],
    [story.pause, BEATS.pause, BEATS.hit],
    [story.hit, BEATS.hit, BEATS.count],
    [`${picture.title}.`.replace(/\.\.$/u, "."), BEATS.count, BEATS.tag - 100],
  ];

  return captions.map(([text, start, end]) =>
    shot(
      captionArt(staged.palette, staged.frame, text),
      until(start === 0 ? from(0) : fadeIn(start, 140), end - FADE_MS)
    )
  );
};

const finishingShots = (staged: Staged): readonly BuildShot[] => {
  const keyed: readonly (readonly [string, Keys])[] = [
    ["verb", slam(BEATS.count + 200, staged.calm)],
    ["blinds", fadeIn(BEATS.count + 300)],
    ["kicker", fadeIn(BEATS.tag)],
    ["meta", fadeIn(BEATS.tag)],
    ["title", slam(BEATS.tag, staged.calm)],
    ["line", fadeIn(BEATS.tag + 260)],
    ["foot", fadeIn(BEATS.tag + 320)],
    ["mark", from(0)],
  ];

  return keyed.flatMap(([role, keys]) => {
    const art = staged.partOf(role);

    return art === undefined ? [] : [shot(art, keys)];
  });
};

const SHAKE: Keys = [
  { at: BEATS.hit, ease: "Hold", pose: REST },
  { at: BEATS.hit + 40, ease: "Linear", pose: { ...REST, dx: 12 } },
  { at: BEATS.hit + 80, ease: "Linear", pose: { ...REST, dx: -9 } },
  { at: BEATS.hit + 120, ease: "Linear", pose: { ...REST, dx: 6 } },
  { at: BEATS.hit + 160, ease: "Linear", pose: { ...REST, dx: -3 } },
  { at: BEATS.hit + 200, ease: "Linear", pose: REST },
];

export const buildPlan = (
  picture: MomentPicture,
  story: MomentStory,
  look: BuildLook
): BuildPlan => {
  const { calm, frame } = look;
  const palette = paletteFor(look.theme, look.deck);
  const geometry = geometryFor(picture, frame);

  const parts = pictureParts(picture, {
    deck: look.deck,
    frame,
    theme: look.theme,
  });

  const solo = picture.seats.length < 2;

  const staged: Staged = {
    boxes: panelBoxes(picture, geometry),
    calm,
    first: solo ? 0 : story.first,
    frame,
    geometry,
    palette,
    partOf: (role, index = 0) =>
      parts.find((each) => each.role === role && each.index === index),
    picture,
    solo,
    story,
    theme: look.theme,
  };

  const seats = picture.seats.map((_, index) => seatShots(staged, index));
  const board = boardShots(staged);
  const actions = actionShots(staged);
  const potPlace = { x: 96, y: footY(geometry, boardSpots(picture, geometry)) };

  const cues = [
    ...seats.flatMap((each) => each.cues),
    ...board.cues,
    ...actions.cues,
    cueAt(BEATS.tag, "Stamp"),
  ];

  return {
    camera: calm ? [] : SHAKE,
    dealt: board.dealt,
    length: BEATS.end,
    sheet: {
      cues: cues.toSorted((left, right) => left.atMs - right.atMs),
      hitMs: BEATS.hit,
      lengthMs: BEATS.end,
      outcome: outcomeOf(picture),
      pauseMs: BEATS.pause,
      resultMs: BEATS.count,
      seed: picture.hand,
      tagMs: BEATS.tag,
    },
    shots: [
      { ...shot(baseArt(palette, frame), from(0)), pinned: true },
      ...seats.flatMap((each) => each.shots),
      ...board.shots,
      ...potShots(palette, staged.partOf("pot"), potPlace, potStagesOf(staged)),
      ...actions.shots,
      ...captionShots(staged),
      ...finishingShots(staged),
    ],
  };
};
