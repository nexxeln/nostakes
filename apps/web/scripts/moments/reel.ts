import "../../src/client/tokens.css";
import { Effect, Option } from "effect";

import { measureParts } from "../../src/client/moments/clip-measure.js";
import {
  clipName,
  clipSupport,
  replayStory,
} from "../../src/client/moments/clip.js";
import { clipWorker, filmOn } from "../../src/client/moments/film-file.js";
import { pictureSvg } from "../../src/features/moments/picture.js";
import { replaySeatsOf } from "../../src/features/moments/replay-plan.js";
import { shownMomentOf } from "../../src/features/moments/scene.js";
import { filmSheet } from "./film-sheet.js";
import { replayHand } from "./replay-hands.js";

const params = new URLSearchParams(globalThis.location.search);

const theme = params.get("theme") === "Dark" ? "Dark" : "Light";

const frame = params.get("frame") === "Chat" ? "Chat" : "Story";

const filmed = params.get("make") === "file";

const deck = "TwoColour" as const;

const TILE = Number(params.get("tile") ?? "6");

const SCALE = Number(params.get("scale") ?? "0.25");

const BEAT_SHOWN_AFTER = 0.72;

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
      frame,
      principals: seats,
      record: hand.record,
      seats: replaySeatsOf(hand),
      slot: Effect.void,
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

await Effect.runPromise(
  program.pipe(
    Effect.catch((error) =>
      Effect.succeed({ failure: `${error._tag}: ${error.message}` })
    ),
    Effect.flatMap((result) =>
      Effect.sync(() => {
        if (stage instanceof HTMLElement) {
          stage.dataset.result = JSON.stringify(result);
        }
      })
    )
  )
);

document.documentElement.dataset.staged = "true";
