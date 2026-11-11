import "../../src/client/tokens.css";
import { codeFor, randomAvatar } from "@nostakes/avatar";
import { replayOf } from "@nostakes/room";
import { Clock, Effect, Option } from "effect";

import { measureParts } from "../../src/client/moments/clip-measure.js";
import { filmSupport, replayFilm } from "../../src/client/moments/clip.js";
import { clipWorker, filmOn } from "../../src/client/moments/film-file.js";
import type { FilmChecks } from "../../src/client/moments/film-file.js";
import type {
  Film,
  FilmKey,
  Mix,
  Shot,
} from "../../src/features/moments/film.js";
import { frameTime } from "../../src/features/moments/film.js";
import { pictureSvg } from "../../src/features/moments/picture.js";
import { replaySeatsOf } from "../../src/features/moments/replay-plan.js";
import { shownMomentOf } from "../../src/features/moments/scene.js";
import { REST } from "../../src/features/moments/timeline.js";
import {
  CARD_RATIO,
  cardArt,
  escaped,
  faceArt,
  ON_RED,
  paletteFor,
  RED,
  sheet,
} from "../../src/features/pictures/paper.js";
import { replayHand } from "./replay-hands.js";

const params = new URLSearchParams(globalThis.location.search);

const theme = params.get("theme") === "Dark" ? "Dark" : "Light";

const deck = "TwoColour" as const;

const number = (name: string, fallback: number) =>
  Number(params.get(name) ?? String(fallback));

const fps = number("fps", 30) === 24 ? 24 : 30;

const stage = document.querySelector("#stage");

const checks: FilmChecks = {
  compare: params.get("compare") === "true",
  redraw: params.get("redraw") === "Whole" ? "Whole" : "Changed",
};

const even = (value: number) => Math.round(value / 2) * 2;

const SEATS = 9;

const CARDS = ["Ah", "Kd", "7c", "7h", "2s", "Qs", "Jd", "Tc", "9h"];

const tableArt = (width: number, height: number) => {
  const palette = paletteFor(theme, deck);
  const rx = width * 0.42;
  const ry = height * 0.34;

  return [
    `<rect x="${-width * 0.1}" y="${-height * 0.1}" width="${width * 1.2}" height="${height * 1.2}" fill="${palette.page}"/>`,
    `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${rx + 40}" ry="${ry + 40}" fill="${palette.shadow}"/>`,
    `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${rx}" ry="${ry}" fill="${palette.felt}"/>`,
    ...Array.from(
      { length: 12 },
      (_, ring) =>
        `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${rx - ring * 22}" ry="${ry - ring * 18}" fill="none" stroke="${palette.edge}" stroke-opacity="0.25" stroke-width="3"/>`
    ),
  ].join("");
};

const PALETTE = paletteFor(theme, deck);

const MARGIN = 12;

const shotIn = (
  art: string,
  place: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
  keys: readonly FilmKey[]
): Shot => ({
  art,
  box: {
    height: even(place.height + MARGIN * 2),
    width: even(place.width + MARGIN * 2),
    x: even(place.x - MARGIN),
    y: even(place.y - MARGIN),
  },
  keys,
});

const faceShot = (
  look: number,
  size: number,
  x: number,
  y: number,
  keys: readonly FilmKey[]
) =>
  shotIn(
    faceArt(
      PALETTE,
      { avatar: codeFor(randomAvatar(look)), expression: "Resting", name: "" },
      theme,
      { size, tagged: false, x, y }
    ),
    { height: size, width: size, x, y },
    keys
  );

const cardShot = (
  card: string,
  width: number,
  x: number,
  y: number,
  keys: readonly FilmKey[]
) =>
  shotIn(
    cardArt(PALETTE, card, { dim: false, turn: 0, width, x, y }),
    { height: width * CARD_RATIO, width, x, y },
    keys
  );

const pillShot = (
  text: string,
  red: boolean,
  x: number,
  y: number,
  keys: readonly FilmKey[]
) => {
  const width = text.length * 20 + 40;

  return shotIn(
    [
      sheet(PALETTE, {
        fill: red ? RED : PALETTE.face,
        height: 52,
        lift: 3,
        radius: 14,
        width,
        x: x - width / 2,
        y: y - 26,
      }),
      `<text x="${x}" y="${y + 11}" text-anchor="middle" font-family="DM Sans, Figtree, sans-serif" font-weight="800" font-size="30" fill="${red ? ON_RED : PALETTE.ink}">${escaped(text)}</text>`,
    ].join(""),
    { height: 56, width: width + 4, x: x - width / 2, y: y - 26 },
    keys
  );
};

const labelShot = (
  text: string,
  size: number,
  x: number,
  y: number,
  keys: readonly FilmKey[]
) => {
  const width = text.length * size * 0.62;

  return shotIn(
    `<text x="${x}" y="${y}" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="700" font-size="${size}" fill="${PALETTE.ink}">${escaped(text)}</text>`,
    { height: size * 1.4, width, x: x - width / 2, y: y - size },
    keys
  );
};

const SOUND_RATE = 48_000;

const stereoBeats = (seconds: number): Mix => {
  const length = seconds * SOUND_RATE;
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  for (let at = 0; at < length; at += 1) {
    const time = at / SOUND_RATE;
    const beat = time % 0.5;
    const envelope = beat < 0.05 ? 1 - beat / 0.05 : 0;

    left[at] = 0.3 * envelope * Math.sin(2 * Math.PI * 440 * time);
    right[at] = 0.3 * envelope * Math.sin(2 * Math.PI * 660 * time);
  }

  return { channels: [left, right], sampleRate: SOUND_RATE };
};

const panFilm = (width: number, height: number, seconds: number): Film => {
  const length = seconds * 1000;
  const shown: readonly FilmKey[] = [{ at: 0, pose: REST }];

  const seats = Array.from({ length: SEATS }, (_, index) => {
    const angle = (Math.PI * 2 * index) / SEATS + Math.PI / 2;

    return {
      x: width / 2 + Math.cos(angle) * width * 0.4,
      y: height / 2 + Math.sin(angle) * height * 0.3,
    };
  });

  const size = Math.round(width * 0.14);

  const faces = seats.map((seat, index) =>
    faceShot(
      index + 3,
      size,
      Math.round(seat.x - size / 2),
      Math.round(seat.y - size / 2),
      shown
    )
  );

  const board = CARDS.slice(0, 5).map((card, index) =>
    cardShot(
      card,
      Math.round(width * 0.1),
      Math.round(width * 0.22 + index * width * 0.115),
      Math.round(height * 0.46),
      [
        { at: 1500 + index * 900, pose: { ...REST, dy: -60, opacity: 0 } },
        { at: 1800 + index * 900, pose: REST },
      ]
    )
  );

  const chips = seats.map((seat, index) =>
    pillShot(
      String((index + 1) * 120),
      index % 3 === 0,
      Math.round(seat.x * 0.75 + width * 0.125),
      Math.round(seat.y * 0.75 + height * 0.125),
      [
        { at: 0, pose: REST },
        { at: length * 0.6, pose: REST },
        {
          at: length * 0.75,
          pose: {
            ...REST,
            dx: width / 2 - seat.x,
            dy: height / 2 - seat.y,
            opacity: 0,
          },
        },
      ]
    )
  );

  const caption = labelShot(
    "Jonas shoves. Priya calls.",
    Math.round(width * 0.05),
    Math.round(width / 2),
    Math.round(height * 0.12),
    [
      { at: 0, pose: { ...REST, opacity: 0 } },
      { at: 600, pose: REST },
    ]
  );

  return {
    camera: [
      { at: 0, pose: { ...REST, dx: -width * 0.06, dy: -height * 0.05 } },
      {
        at: length,
        ease: "Linear",
        pose: { ...REST, dx: width * 0.06, dy: height * 0.05, scale: 1.25 },
      },
    ],
    fps,
    height,
    length,
    shots: [
      {
        art: tableArt(width, height),
        box: {
          height: even(height * 1.2),
          width: even(width * 1.2),
          x: even(-width * 0.1),
          y: even(-height * 0.1),
        },
        keys: shown,
      },
      ...faces,
      ...board,
      ...chips,
      { ...caption, pinned: true },
    ],
    sound: params.get("sound") === "stereo" ? stereoBeats(seconds) : null,
    width,
  };
};

const CLICK_SECONDS = 0.004;

const CLICK_HZ = 2000;

const syncTimes = (seconds: number) => {
  const frames = Math.ceil(seconds * fps);
  const lead = Math.round(fps / 2);

  return [frameTime(lead, fps), frameTime(frames - lead, fps)] as const;
};

const clicked = (seconds: number, at: number) => {
  const channel = new Float32Array(Math.round(seconds * SOUND_RATE));
  const start = Math.round((at / 1000) * SOUND_RATE);

  for (let index = 0; index < CLICK_SECONDS * SOUND_RATE; index += 1) {
    channel[start + index] =
      0.8 * Math.sin((2 * Math.PI * CLICK_HZ * index) / SOUND_RATE);
  }

  return channel;
};

const syncFilm = (width: number, height: number, seconds: number): Film => {
  const [first, last] = syncTimes(seconds);
  const step = frameTime(1, fps);
  const dark = { ...REST, opacity: 0 };

  return {
    camera: [],
    fps,
    height,
    length: seconds * 1000,
    shots: [
      {
        art: `<rect x="0" y="0" width="${width}" height="${height}" fill="#000"/>`,
        box: { height, width, x: 0, y: 0 },
        keys: [{ at: 0, pose: REST }],
      },
      {
        art: `<rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/>`,
        box: { height, width, x: 0, y: 0 },
        keys: [
          { at: 0, pose: dark },
          { at: first, ease: "Hold", pose: REST },
          { at: first + step, ease: "Hold", pose: dark },
          { at: last, ease: "Hold", pose: REST },
          { at: last + step, ease: "Hold", pose: dark },
        ],
      },
    ],
    sound: {
      channels: [clicked(seconds, first), clicked(seconds, last)],
      sampleRate: SOUND_RATE,
    },
    width,
  };
};

const measured = (svg: string) => {
  const host = document.createElement("div");

  host.style.width = "420px";
  host.innerHTML = svg;
  document.body.append(host);

  const root = host.querySelector("svg");
  const boxes = root === null ? [] : measureParts(root);

  host.remove();

  return boxes;
};

const filmFor = Effect.gen(function* chooseFilm() {
  const worker = yield* clipWorker;

  if (params.get("scene") === "sync") {
    return {
      film: syncFilm(
        number("width", 720),
        number("height", 1280),
        number("seconds", 25)
      ),
      worker,
    };
  }

  if (params.get("scene") !== "replay") {
    return {
      film: panFilm(
        number("width", 1080),
        number("height", 1920),
        number("seconds", 25)
      ),
      worker,
    };
  }

  const hand = replayHand(params.get("hand") ?? "AcesCracked", { deck, theme });
  const found = shownMomentOf(hand);
  const replay = replayOf(hand.record);

  if (Option.isNone(found) || Option.isNone(replay)) {
    return yield* Effect.die(new Error("the sample hand has no moment"));
  }

  const { picture, seats } = found.value;

  yield* Effect.promise(() => document.fonts.ready);

  const film = yield* replayFilm(
    worker,
    picture,
    { deck, theme },
    {
      boxes: measured(
        pictureSvg(picture, { deck, fonts: "", frame: "Table", theme })
      ),
      budgetMs: null,
      frame: "Chat",
      principals: seats,
      record: hand.record,
      seats: replaySeatsOf(hand),
      slot: Effect.void,
      support: { codec: "", sound: false },
      svg: pictureSvg(picture, { deck, fonts: "", frame: "Chat", theme }),
    }
  );

  return { film, worker };
});

const filmText = (file: Blob) =>
  Effect.runPromise(
    Effect.promise(() => file.arrayBuffer()).pipe(
      Effect.map((buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = "";

        for (let at = 0; at < bytes.length; at += 32_768) {
          binary += String.fromCodePoint(...bytes.subarray(at, at + 32_768));
        }

        return btoa(binary);
      })
    )
  );

const program = Effect.gen(function* makeFilm() {
  const { film, worker } = yield* filmFor;
  const support = yield* filmSupport(film);

  if (Option.isNone(support)) {
    return { state: "Unsupported" };
  }

  const started = yield* Clock.currentTimeMillis;

  const made = yield* filmOn(
    worker,
    film,
    {
      budgetMs: null,
      name: "nostakes-film.mp4",
      slot: Effect.void,
      support: support.value,
    },
    checks
  );

  const finished = yield* Clock.currentTimeMillis;

  Object.assign(globalThis, {
    __film: made.file,
    __filmText: () => filmText(made.file),
  });

  return {
    bytes: made.file.size,
    compared: made.compared,
    delay: made.delay,
    flashes:
      params.get("scene") === "sync" ? syncTimes(number("seconds", 25)) : [],
    frames: Math.ceil((film.length * film.fps) / 1000),
    ms: finished - started,
    redrawn: made.redrawn,
    state: "Made",
  };
}).pipe(
  Effect.scoped,
  Effect.catchTags({
    ClipTooSlow: (slow) =>
      Effect.succeed({ detail: slow.message, state: "Failed" }),
    ClipUnavailable: (unavailable) =>
      Effect.succeed({ detail: unavailable.message, state: "Failed" }),
  })
);

await Effect.runPromise(
  program.pipe(
    Effect.flatMap((result) =>
      Effect.sync(() => {
        if (stage instanceof HTMLElement) {
          stage.dataset.result = JSON.stringify(result);
        }
      })
    )
  )
);
