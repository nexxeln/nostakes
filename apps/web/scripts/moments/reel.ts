import "../../src/client/tokens.css";
import { Effect, Option } from "effect";

import {
  clipName,
  clipSupport,
  momentFilm,
} from "../../src/client/moments/clip.js";
import type { ClipLook } from "../../src/client/moments/clip.js";
import { clipWorker, filmOn } from "../../src/client/moments/film-file.js";
import { BEATS, buildPlan } from "../../src/features/moments/build.js";
import { sceneOf } from "../../src/features/moments/scene.js";
import { filmSheet } from "./film-sheet.js";
import { replayHand } from "./replay-hands.js";

const params = new URLSearchParams(globalThis.location.search);

const theme = params.get("theme") === "Dark" ? "Dark" : "Light";

const frame = params.get("frame") === "Chat" ? "Chat" : "Story";

const filmed = params.get("make") === "file";

const calm = params.get("calm") === "true";

const deck = "TwoColour" as const;

const TILE = Number(params.get("tile") ?? "6");

const SCALE = Number(params.get("scale") ?? "0.25");

const hand = replayHand(params.get("hand") ?? "", { deck, theme });

const stage = document.querySelector("#stage");

const base64Of = (bytes: Uint8Array) => {
  let binary = "";

  for (let at = 0; at < bytes.length; at += 32_768) {
    binary += String.fromCodePoint(...bytes.subarray(at, at + 32_768));
  }

  return btoa(binary);
};

const SILENT = { codec: "" };

const STORYBOARD = [
  0,
  BEATS.land + 300,
  BEATS.bet + 600,
  BEATS.pause + 900,
  BEATS.hit + 120,
  BEATS.hit + 900,
  BEATS.count + 700,
  BEATS.tag + 500,
  BEATS.end - 34,
];

const program = Effect.gen(function* reel() {
  const scene = sceneOf(hand);

  if (Option.isNone(scene)) {
    return { failure: "the hand has no moment" };
  }

  const { picture, story } = scene.value;

  yield* Effect.promise(() => document.fonts.ready);

  const support = filmed
    ? Option.getOrElse(yield* clipSupport(frame), () => SILENT)
    : SILENT;

  const started = performance.now();
  const look: ClipLook = { calm, deck, theme };

  const film = yield* momentFilm(scene.value, look, {
    frame,
    slot: Effect.void,
  });

  const plan = buildPlan(picture, story, { ...look, frame });
  const told = performance.now();

  const sheet = yield* filmSheet(film, {
    scale: SCALE,
    tile: TILE,
    times: STORYBOARD,
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
    beats: BEATS,
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
    times: STORYBOARD,
    title: picture.title,
    toldMs: Math.round(told - started),
  };
}).pipe(Effect.scoped);

await Effect.runPromise(
  program.pipe(
    Effect.match({
      onFailure: (failure) =>
        JSON.stringify({ failure: `${failure._tag}: ${failure.message}` }),
      onSuccess: (result) => JSON.stringify(result),
    }),
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
