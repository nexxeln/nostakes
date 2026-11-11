import { CAST } from "../../../src/features/landing/cast.js";
import {
  RAIL,
  actorMarkup,
  bubbleMarkup,
  captionMarkup,
  cardMarkup,
  closeupMarkup,
  emptyInks,
  inkRules,
  peekCardMarkup,
  pileMarkup,
  potMarkup,
  ringMarkup,
  sheetMarkup,
  stackMarkup,
} from "./art.js";
import type { Inks } from "./art.js";
import { DESK, LINE_NAMES, PHONE, PLAYERS } from "./cuts.js";
import type { Cut, LineName } from "./cuts.js";
import {
  FILM_LENGTH,
  ROOT,
  keyframesCss,
  move,
  rest,
  script,
  stylesOf,
} from "./engine.js";
import type { Film, Names } from "./engine.js";
import {
  BOARD,
  CHANCES,
  HANDS,
  momentArt,
  momentCardFrames,
  momentStaging,
  settleUpArt,
} from "./pictures.js";
import {
  BETS,
  CAPTIONS,
  LINES,
  RIVER_CAPTION,
  ROLES,
  SCRAPS,
  STREETS,
  actorId,
  emptyId,
  holeId,
  lineId,
  scoreFor,
  scrapId,
} from "./score.js";

export type Layer = "back" | "caps" | "hud" | "over" | "talk" | "world";

export interface Placed {
  readonly id: string;
  readonly kind: string;
  readonly layer: Layer;
  readonly markup: string;
}

const MOMENT_FROM = 756;

const MOMENT_FOR = 46;

const PRINT_FROM = 872;

const PRINT_STEPS = 7;

const PRINT_STEP = 6;

const LINK_CARD =
  '<span class="link"><b>nostakes</b><span>Poker night. Pull up a chair.</span><i>nostakes.club</i></span>';

const CLIP_THUMB = '<span class="thumb"><i></i><i></i><i></i></span>';

const linesOf = (name: LineName) => {
  const line = LINES[name];

  if (name === "Link") {
    return bubbleMarkup(line.who, "", LINK_CARD);
  }

  return bubbleMarkup(line.who, line.say, name === "Clip" ? CLIP_THUMB : "");
};

const holeCard = (player: (typeof PLAYERS)[number], index: number) => {
  if (player === "Jonas" || player === "Priya") {
    return cardMarkup(HANDS[player][index] ?? "", "hole shown");
  }

  return cardMarkup("", "hole");
};

export const placedSprites = (
  inks: Inks,
  moment: string
): readonly Placed[] => [
  {
    id: "felt",
    kind: "",
    layer: "back",
    markup: sheetMarkup("felt", '<i class="rim"></i><i class="cloth"></i>'),
  },
  {
    id: "you",
    kind: "",
    layer: "world",
    markup: sheetMarkup(
      "seat",
      '<i class="dash"></i><i class="glow" data-p="glow"></i><span data-p="sit">Sit</span>'
    ),
  },
  ...PLAYERS.map((player) => ({
    id: emptyId(player),
    kind: "",
    layer: "world" as const,
    markup: sheetMarkup("seat", '<i class="dash"></i>'),
  })),
  ...PLAYERS.map((player) => ({
    id: actorId(player),
    kind: "who",
    layer: "world" as const,
    markup: actorMarkup(inks, {
      ...ROLES[player],
      avatar: CAST[player],
      name: player,
    }),
  })),
  {
    id: "deck",
    kind: "",
    layer: "world",
    markup: sheetMarkup(
      "card deck",
      '<i class="sh" data-p="sh"></i><i class="bk b2"></i><i class="bk b1"></i><i class="bk"></i><b class="band" data-p="band">Sealed</b>'
    ),
  },
  {
    id: "button",
    kind: "",
    layer: "world",
    markup: sheetMarkup("dealer", "<b>D</b>"),
  },
  ...PLAYERS.flatMap((player) =>
    [0, 1].map((index) => ({
      id: holeId(player, index),
      kind: "",
      layer: "world" as const,
      markup: holeCard(player, index),
    }))
  ),
  ...BOARD.slice(0, 4).map((card, index) => ({
    id: `b-${index}`,
    kind: "",
    layer: "world" as const,
    markup: cardMarkup(card, "board"),
  })),
  {
    id: "river",
    kind: "",
    layer: "world",
    markup: peekCardMarkup(BOARD[4]),
  },
  ...BETS.map((bet) => ({
    id: bet.id,
    kind: "",
    layer: "world" as const,
    markup:
      bet.chips.length > 1
        ? stackMarkup(bet.amount, bet.chips)
        : pileMarkup(bet.amount, bet.chips[0] ?? 0),
  })),
  {
    id: "pot",
    kind: "",
    layer: "world",
    markup: potMarkup(["240", "600", "2,120"]),
  },
  {
    id: "chance-jonas",
    kind: "",
    layer: "world",
    markup: sheetMarkup("chance", `${CHANCES.Jonas}%`),
  },
  {
    id: "chance-priya",
    kind: "",
    layer: "world",
    markup: sheetMarkup("chance low", `${CHANCES.Priya}%`),
  },
  {
    id: "rules",
    kind: "",
    layer: "world",
    markup: sheetMarkup(
      "rules",
      '<i class="sh" data-p="sh"></i><div class="sheet"><span class="k">House rules</span><span class="v">No-limit hold\'em, 10/20</span><span class="v">Straddle on. Run it twice.</span><span class="by">Sam\'s table</span></div>'
    ),
  },
  {
    id: "headline",
    kind: "",
    layer: "over",
    markup: sheetMarkup(
      "headline",
      '<i class="sh" data-p="sh"></i><h1><span>Your friends moved.</span> <span>Poker night didn\'t.</span></h1>'
    ),
  },
  {
    id: "closeup-maya",
    kind: "",
    layer: "over",
    markup: closeupMarkup(
      inks,
      { ...ROLES.Maya, avatar: CAST.Maya, name: "Maya" },
      ["Resting", "LookingDown"],
      ""
    ),
  },
  {
    id: "closeup-priya",
    kind: "",
    layer: "over",
    markup: closeupMarkup(
      inks,
      { ...ROLES.Priya, avatar: CAST.Priya, name: "Priya" },
      ["Thinking"],
      `<div class="clock">${ringMarkup()}</div>${RAIL}`
    ),
  },
  {
    id: "seat-0",
    kind: "",
    layer: "over",
    markup: cardMarkup("", "hole shown"),
  },
  {
    id: "seat-1",
    kind: "",
    layer: "over",
    markup: cardMarkup("", "hole shown"),
  },
  ...Array.from({ length: SCRAPS }, (_, index) => ({
    id: scrapId(index),
    kind: "",
    layer: "over" as const,
    markup: `<i class="c scrap scrap-${index % 5}"></i>`,
  })),
  {
    id: "moment",
    kind: "",
    layer: "over",
    markup: sheetMarkup(
      "moment",
      `<div class="card" data-p="card">${moment}</div>`
    ),
  },
  {
    id: "slip",
    kind: "",
    layer: "over",
    markup: sheetMarkup(
      "slip",
      `<div class="mouth"><div class="paper" data-p="paper">${settleUpArt(inks)}</div></div><i class="slot"></i>`
    ),
  },
  {
    id: "title",
    kind: "",
    layer: "over",
    markup: sheetMarkup("title", "<h2>Your deal.</h2>"),
  },
  ...LINE_NAMES.map((name) => ({
    id: lineId(name),
    kind: "",
    layer: "talk" as const,
    markup: linesOf(name),
  })),
  ...CAPTIONS.map((caption) => ({
    id: caption.id,
    kind: "",
    layer: "caps" as const,
    markup: captionMarkup(caption.lines),
  })),
  {
    id: RIVER_CAPTION.id,
    kind: "",
    layer: "caps",
    markup:
      '<p class="cap"><span class="l0 ask">Hold the card to peek at the river.</span><span class="l0 told">You know. Jonas doesn\'t.</span></p>',
  },
  ...STREETS.map((street) => ({
    id: street.id,
    kind: "",
    layer: "hud" as const,
    markup: `<span class="street">${street.name}</span>`,
  })),
];

const fades = (
  film: Film,
  id: string,
  span: { readonly from: number; readonly to: number },
  shift: { readonly x: number; readonly y: number }
) => {
  const opens = span.from <= 0;

  rest(film, id, ROOT, opens ? {} : { opacity: 0, x: shift.x, y: shift.y });

  if (!opens) {
    move(
      film,
      [id, ROOT],
      { from: span.from, to: span.from + 6 },
      { opacity: 1, x: 0, y: 0 }
    );
  }

  if (span.to < FILM_LENGTH) {
    move(
      film,
      [id, ROOT],
      { ease: "In", from: span.to, to: span.to + 5 },
      { opacity: 0, x: -shift.x, y: -shift.y }
    );
  }
};

const spread = (at: number) => MOMENT_FROM + at * MOMENT_FOR;

const staged = (frame: Cut, moment: string): Film => {
  const film = scoreFor(frame);

  for (const caption of [...CAPTIONS, RIVER_CAPTION]) {
    fades(film, caption.id, caption, { x: 0, y: 8 });
  }

  for (const street of STREETS) {
    fades(film, street.id, street, { x: 0, y: -6 });
  }

  script(
    film,
    ["moment", "card"],
    momentCardFrames().map(({ at, css }) => ({ at: spread(at), css }))
  );

  for (const { frames, part } of momentStaging(moment)) {
    script(
      film,
      ["moment", part],
      frames.map(({ at, css }) => ({ at: spread(at), css }))
    );
  }

  script(
    film,
    ["slip", "paper"],
    [
      { at: PRINT_FROM, css: "transform:translateY(101%)" },
      ...Array.from({ length: PRINT_STEPS }, (_, index) => {
        const lands = PRINT_FROM + (index + 1) * PRINT_STEP;
        const shown = 101 - ((index + 1) * 101) / PRINT_STEPS;

        return [
          {
            at: lands - PRINT_STEP * 0.45,
            css: `transform:translateY(${(shown + 101 / PRINT_STEPS).toFixed(2)}%)`,
          },
          { at: lands, css: `transform:translateY(${shown.toFixed(2)}%)` },
        ];
      }).flat(),
    ]
  );

  return film;
};

export const DESK_QUERY = "(min-width: 900px) and (min-aspect-ratio: 5/4)";

export interface Filmed {
  readonly animations: number;
  readonly css: string;
  readonly layers: Readonly<Record<Layer, string>>;
  readonly sprites: number;
}

export const filmed = (): Filmed => {
  const inks = emptyInks();
  const moment = momentArt(inks);
  const sprites = placedSprites(inks, moment);
  const names: Names = new Map();
  const phone = stylesOf(staged(PHONE, moment), names);
  const desk = stylesOf(staged(DESK, moment), names);
  const same = new Set(phone.rules);
  const deskOnly = desk.rules.filter((rule) => !same.has(rule));

  const layer = (wanted: Layer) =>
    sprites
      .filter((sprite) => sprite.layer === wanted)
      .map(
        ({ id, kind, markup }) =>
          `<div class="sp${kind === "" ? "" : ` ${kind}`}" id="${id}">${markup}</div>`
      )
      .join("\n");

  return {
    animations: names.size,
    css: [
      inkRules(inks),
      phone.rules.join("\n"),
      `@media ${DESK_QUERY}{\n${deskOnly.join("\n")}\n}`,
      keyframesCss(names),
    ].join("\n"),
    layers: {
      back: layer("back"),
      caps: layer("caps"),
      hud: layer("hud"),
      over: layer("over"),
      talk: layer("talk"),
      world: layer("world"),
    },
    sprites: sprites.length,
  };
};
