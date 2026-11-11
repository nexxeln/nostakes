import "../../src/client/tokens.css";
import { Effect, Option } from "effect";

import { measureParts } from "../../src/client/moments/clip-measure.js";
import {
  cardFilm,
  clipName,
  clipSupport,
  replayStory,
} from "../../src/client/moments/clip.js";
import { clipWorker, filmOn } from "../../src/client/moments/film-file.js";
import { shortSheet } from "../../src/features/moments/clip-plan.js";
import { pictureSvg } from "../../src/features/moments/picture.js";
import {
  outcomeOf,
  replayNotesOf,
  replaySeatsOf,
} from "../../src/features/moments/replay-plan.js";
import { shownMomentOf } from "../../src/features/moments/scene.js";
import { filmSheet } from "./film-sheet.js";
import { replayHand } from "./replay-hands.js";
import { samplePicture } from "./samples.js";

const params = new URLSearchParams(globalThis.location.search);

const theme = params.get("theme") === "Dark" ? "Dark" : "Light";

const frame = params.get("frame") === "Chat" ? "Chat" : "Story";

const filmed = params.get("make") === "file";

const style = params.get("style") === "Drift" ? "Drift" : "Broadcast";

const calm = params.get("calm") === "true";

const deck = "TwoColour" as const;

const TILE = Number(params.get("tile") ?? "6");

const SCALE = Number(params.get("scale") ?? "0.25");

const BEAT_SHOWN_AFTER = 0.72;

const sample = params.get("sample") ?? "";

const hand = replayHand(params.get("hand") ?? "", { deck, theme });

const stage = document.querySelector("#stage");

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

const base64Of = (bytes: Uint8Array) => {
  let binary = "";

  for (let at = 0; at < bytes.length; at += 32_768) {
    binary += String.fromCodePoint(...bytes.subarray(at, at + 32_768));
  }

  return btoa(binary);
};

const SILENT = { codec: "", sound: false };

const SHORT_TIMES = [0, 900, 1500, 2100, 2334, 2700, 4466];

const shortReel = Effect.gen(function* short() {
  const picture = samplePicture(sample);

  yield* Effect.promise(() => document.fonts.ready);

  const boxes = measured(
    pictureSvg(picture, { deck, fonts: "", frame: "Table", theme })
  );

  const support = filmed
    ? Option.getOrElse(yield* clipSupport(frame), () => SILENT)
    : SILENT;

  const started = performance.now();

  const film = yield* cardFilm(
    picture,
    { deck, theme },
    {
      boxes,
      budgetMs: null,
      frame,
      slot: Effect.void,
      support,
      svg: pictureSvg(picture, { deck, fonts: "", frame, theme }),
    }
  );

  const told = performance.now();

  const sheet = yield* filmSheet(film, {
    scale: SCALE,
    tile: TILE,
    times: SHORT_TIMES,
  });

  const worker = yield* clipWorker;

  const made =
    filmed && support.codec.length > 0
      ? yield* filmOn(worker, film, {
          budgetMs: null,
          name: clipName(picture, frame),
          slot: Effect.void,
          support,
        })
      : null;

  const bytes =
    made === null
      ? null
      : new Uint8Array(yield* Effect.promise(() => made.file.arrayBuffer()));

  return {
    file: bytes === null ? "" : base64Of(bytes),
    length: film.length,
    madeMs: Math.round(performance.now() - told),
    score: shortSheet({
      cards: 3,
      outcome: outcomeOf(picture.kind),
      seed: picture.pot,
    }),
    sheet: sheet.png,
    shots: film.shots.length,
    title: picture.title,
    toldMs: Math.round(told - started),
  };
}).pipe(Effect.scoped);

const program = Effect.gen(function* reel() {
  const found = shownMomentOf(hand);

  if (Option.isNone(found)) {
    return { failure: "the hand has no moment" };
  }

  const { picture, seats } = found.value;

  yield* Effect.promise(() => document.fonts.ready);

  const boxes = measured(
    pictureSvg(picture, { deck, fonts: "", frame: "Table", theme })
  );

  const support = filmed
    ? Option.getOrElse(yield* clipSupport(frame), () => SILENT)
    : SILENT;

  const worker = yield* clipWorker;
  const started = performance.now();

  const { film, plan } = yield* replayStory(
    worker,
    picture,
    { deck, theme },
    {
      boxes,
      budgetMs: null,
      calm,
      frame,
      notes: replayNotesOf(hand),
      principals: seats,
      record: hand.record,
      seats: replaySeatsOf(hand),
      slot: Effect.void,
      style,
      support,
      svg: pictureSvg(picture, { deck, fonts: "", frame, theme }),
    }
  );

  const told = performance.now();

  const times = plan.beats.map((beat) =>
    Math.round(beat.at + Math.min(beat.hold - 34, beat.hold * BEAT_SHOWN_AFTER))
  );

  const sheet = yield* filmSheet(film, { scale: SCALE, tile: TILE, times });

  const made =
    filmed && support.codec.length > 0
      ? yield* filmOn(worker, film, {
          budgetMs: null,
          name: clipName(picture, frame),
          slot: Effect.void,
          support,
        })
      : null;

  const bytes =
    made === null
      ? null
      : new Uint8Array(yield* Effect.promise(() => made.file.arrayBuffer()));

  return {
    beats: plan.beats,
    file: bytes === null ? "" : base64Of(bytes),
    kind: picture.kind,
    length: film.length,
    madeMs: Math.round(performance.now() - told),
    redrawn: made?.redrawn ?? 0,
    score: plan.sheet,
    sheet: sheet.png,
    shots: film.shots.length,
    sound: film.sound !== null,
    tier: picture.tier,
    times,
    title: picture.title,
    toldMs: Math.round(told - started),
  };
}).pipe(Effect.scoped);

const written = <
  A,
  E extends { readonly _tag: string; readonly message: string },
>(
  reel: Effect.Effect<A, E>
) =>
  reel.pipe(
    Effect.match({
      onFailure: (failure) =>
        JSON.stringify({ failure: `${failure._tag}: ${failure.message}` }),
      onSuccess: (result) => JSON.stringify(result),
    })
  );

await Effect.runPromise(
  (sample.length > 0 ? written(shortReel) : written(program)).pipe(
    Effect.flatMap((result) =>
      Effect.sync(() => {
        if (stage instanceof HTMLElement) {
          stage.dataset.result = result;
        }
      })
    )
  )
);

document.documentElement.dataset.staged = "true";
