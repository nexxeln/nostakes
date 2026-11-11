import { captionMarkup, emptyInks, inkRules } from "./art.js";
import { lineId } from "./cast.js";
import type { Cut } from "./cuts.js";
import {
  ROOT,
  cut,
  keyframesCss,
  move,
  rest,
  script,
  stylesOf,
} from "./engine.js";
import type { Film, Names } from "./engine.js";
import { DESK_QUERY, placedSprites } from "./film.js";
import type { Placed } from "./film.js";
import { momentArt, momentCardFrames, momentStaging } from "./pictures.js";
import { TIMED_DESK, TIMED_PHONE } from "./timed-cuts.js";
import {
  TIMED_ACTS,
  TIMED_CAPTIONS,
  TIMED_LENGTH,
  TIMED_LINES,
  TIMED_MOMENT,
  TIMED_PRINT,
  TIMED_RIVER_CAPTION,
  timedScoreFor,
} from "./timed-score.js";

const CUT = new Set(["closeup-priya", "headline", "rules"]);

const SPOKEN = new Set(TIMED_LINES.map(({ name }) => lineId(name)));

const kept = ({ id, layer }: Placed) =>
  !CUT.has(id) &&
  layer !== "caps" &&
  layer !== "hud" &&
  (layer !== "talk" || SPOKEN.has(id));

const RIVER_LINES =
  '<p class="cap"><span class="l0 ask">Hold the card to peek at the river.</span><span class="l0 told">You know. Jonas doesn\'t.</span></p>';

const captions = () =>
  [
    ...TIMED_CAPTIONS.map(({ id, lines }) => ({
      id,
      markup: captionMarkup(lines),
    })),
    { id: TIMED_RIVER_CAPTION.id, markup: RIVER_LINES },
  ]
    .map(({ id, markup }) => `<div class="sp" id="${id}">${markup}</div>`)
    .join("\n");

const marks = () =>
  TIMED_ACTS.map(
    ({ from, id, name }) =>
      `<button class="seg" type="button" id="${id}" data-at="${from}"><i data-p="fill"></i><span data-p="name">${name}</span></button>`
  ).join("\n");

const FADE_IN = 140;

const FADE_OUT = 120;

const fades = (
  film: Film,
  id: string,
  span: { readonly from: number; readonly to: number }
) => {
  const opens = span.from <= 0;

  rest(film, id, ROOT, opens ? {} : { opacity: 0, y: 8 });

  if (!opens) {
    move(
      film,
      [id, ROOT],
      { from: span.from, to: span.from + FADE_IN },
      { opacity: 1, y: 0 }
    );
  }

  if (span.to < TIMED_LENGTH) {
    move(
      film,
      [id, ROOT],
      { ease: "In", from: span.to, to: span.to + FADE_OUT },
      { opacity: 0, y: -8 }
    );
  }
};

const QUIET = 0.5;

const spread = (at: number) => TIMED_MOMENT.from + at * TIMED_MOMENT.for;

const staged = (frame: Cut, moment: string): Film => {
  const film = timedScoreFor(frame);

  for (const caption of [...TIMED_CAPTIONS, TIMED_RIVER_CAPTION]) {
    fades(film, caption.id, caption);
  }

  for (const act of TIMED_ACTS) {
    script(
      film,
      [act.id, "fill"],
      [
        { at: act.from, css: "transform:scaleX(0)" },
        { at: act.to, css: "transform:scaleX(1)" },
      ]
    );
    rest(film, act.id, "name", { opacity: act.from <= 0 ? 1 : QUIET });
    cut(film, [act.id, "name"], act.from, { opacity: 1 });

    if (act.to < TIMED_LENGTH) {
      cut(film, [act.id, "name"], act.to, { opacity: QUIET });
    }
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
      { at: TIMED_PRINT.from, css: "transform:translateY(101%)" },
      ...Array.from({ length: TIMED_PRINT.steps }, (_, index) => {
        const lands = TIMED_PRINT.from + (index + 1) * TIMED_PRINT.step;
        const shown = 101 - ((index + 1) * 101) / TIMED_PRINT.steps;

        return [
          {
            at: lands - TIMED_PRINT.step * 0.45,
            css: `transform:translateY(${(shown + 101 / TIMED_PRINT.steps).toFixed(2)}%)`,
          },
          { at: lands, css: `transform:translateY(${shown.toFixed(2)}%)` },
        ];
      }).flat(),
    ]
  );

  return film;
};

export type TimedLayer = "back" | "over" | "talk" | "world";

export interface TimedFilm {
  readonly animations: number;
  readonly captions: string;
  readonly css: string;
  readonly layers: Readonly<Record<TimedLayer, string>>;
  readonly marks: string;
  readonly sprites: number;
}

export const timedFilm = (): TimedFilm => {
  const inks = emptyInks();
  const moment = momentArt(inks);
  const sprites = placedSprites(inks, moment).filter(kept);
  const names: Names = new Map();
  const phone = stylesOf(staged(TIMED_PHONE, moment), names);
  const desk = stylesOf(staged(TIMED_DESK, moment), names);
  const same = new Set(phone.rules);
  const deskOnly = desk.rules.filter((rule) => !same.has(rule));

  const layer = (wanted: TimedLayer) =>
    sprites
      .filter((sprite) => sprite.layer === wanted)
      .map(
        ({ id, kind, markup }) =>
          `<div class="sp${kind === "" ? "" : ` ${kind}`}" id="${id}">${markup}</div>`
      )
      .join("\n");

  return {
    animations: names.size,
    captions: captions(),
    css: [
      inkRules(inks),
      phone.rules.join("\n"),
      `@media ${DESK_QUERY}{\n${deskOnly.join("\n")}\n}`,
      keyframesCss(names),
    ].join("\n"),
    layers: {
      back: layer("back"),
      over: layer("over"),
      talk: layer("talk"),
      world: layer("world"),
    },
    marks: marks(),
    sprites: sprites.length,
  };
};
