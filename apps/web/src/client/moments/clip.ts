import { Effect, Option } from "effect";

import type { Deck, Theme } from "../../features/model.js";
import { CLIP_FPS } from "../../features/moments/atlas.js";
import { buildPlan } from "../../features/moments/build.js";
import { filmFrames, frameTime } from "../../features/moments/film.js";
import type { Film } from "../../features/moments/film.js";
import type { MomentPicture } from "../../features/moments/picture.js";
import type { MomentScene } from "../../features/moments/scene.js";
import { FRAME_SIZES } from "../../features/pictures/paper.js";
import type { KeptFrame } from "../../features/pictures/paper.js";
import type { ClipUnavailable } from "./clip-layers.js";
import { filmFile } from "./film-file.js";
import type { ClipSupport, ClipTooSlow, FilmWatch } from "./film-file.js";
import { mixedOffThread } from "./soundtrack.js";

export { ClipUnavailable } from "./clip-layers.js";

export type { MomentScene } from "../../features/moments/scene.js";

export { ClipTooSlow, filmFile } from "./film-file.js";

export type { ClipSupport, FilmMade, FilmOrder } from "./film-file.js";

const VIDEO_CODECS = ["avc1.640028", "avc1.4D4028", "avc1.42E028"];

const VIDEO_BITRATE = 3_000_000;

const ENCODING_GLOBALS = [
  "OffscreenCanvas",
  "VideoEncoder",
  "VideoFrame",
  "Worker",
] as const;

const hasEncoders = () => ENCODING_GLOBALS.every((name) => name in globalThis);

const videoCodec = (size: {
  readonly height: number;
  readonly width: number;
}) =>
  Effect.all(
    VIDEO_CODECS.map((codec) =>
      Effect.tryPromise(() =>
        VideoEncoder.isConfigSupported({
          avc: { format: "avc" },
          bitrate: VIDEO_BITRATE,
          codec,
          framerate: CLIP_FPS,
          height: size.height,
          width: size.width,
        })
      ).pipe(
        Effect.map((found) => (found.supported === true ? [codec] : [])),
        Effect.orElseSucceed(() => [])
      )
    )
  ).pipe(Effect.map((found) => Option.fromNullishOr(found.flat()[0])));

export const filmSupport = (size: {
  readonly height: number;
  readonly width: number;
}): Effect.Effect<Option.Option<ClipSupport>> =>
  hasEncoders()
    ? videoCodec(size).pipe(Effect.map(Option.map((codec) => ({ codec }))))
    : Effect.succeedNone;

export const clipSupport = (
  frame: KeptFrame
): Effect.Effect<Option.Option<ClipSupport>> => filmSupport(FRAME_SIZES[frame]);

export type ClipPace = "Asked" | "Quiet";

const QUIET_MS = 6;

const ASKED_WAIT_MS = 120;

const afterPaint: Effect.Effect<void> = Effect.callback<"Painted">((resume) => {
  const channel = new MessageChannel();

  channel.port1.addEventListener("message", () => {
    resume(Effect.succeed("Painted"));
  });
  channel.port1.start();

  const id = requestAnimationFrame(() => {
    channel.port2.postMessage(0);
  });

  return Effect.sync(() => {
    cancelAnimationFrame(id);
    channel.port1.close();
  });
}).pipe(Effect.asVoid);

const idleFor = (pace: ClipPace): Effect.Effect<void> =>
  Effect.callback<"Idle">((resume) => {
    const waiting = { id: 0 };

    const ask = () => {
      waiting.id = globalThis.requestIdleCallback(
        (deadline) => {
          if (
            pace === "Asked" ||
            deadline.didTimeout ||
            deadline.timeRemaining() >= QUIET_MS
          ) {
            resume(Effect.succeed("Idle"));
          } else {
            ask();
          }
        },
        pace === "Asked" ? { timeout: ASKED_WAIT_MS } : {}
      );
    };

    ask();

    return Effect.sync(() => {
      globalThis.cancelIdleCallback(waiting.id);
    });
  }).pipe(Effect.asVoid);

export const slotFor = (pace: ClipPace): Effect.Effect<void> =>
  "requestIdleCallback" in globalThis ? idleFor(pace) : afterPaint;

export const clipName = (picture: MomentPicture, frame: KeptFrame) =>
  `nostakes-${picture.title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}${frame === "Story" ? "-story" : ""}.mp4`;

export interface ClipLook {
  readonly calm: boolean;
  readonly deck: Deck;
  readonly theme: Theme;
}

export interface ClipOrder {
  readonly budgetMs: number | null;
  readonly frame: KeptFrame;
  readonly scale?: number;
  readonly slot: Effect.Effect<void>;
  readonly support: ClipSupport;
  readonly watch?: FilmWatch;
}

export const momentFilm = (
  scene: MomentScene,
  look: ClipLook,
  order: Pick<ClipOrder, "frame" | "slot">
): Effect.Effect<Film, ClipUnavailable> =>
  Effect.gen(function* film() {
    const size = FRAME_SIZES[order.frame];

    const plan = buildPlan(scene.picture, scene.story, {
      ...look,
      frame: order.frame,
    });

    const length = frameTime(
      filmFrames({ fps: CLIP_FPS, length: plan.length }),
      CLIP_FPS
    );

    yield* order.slot;

    const sound = yield* mixedOffThread({ ...plan.sheet, lengthMs: length });

    return {
      camera: plan.camera,
      fps: CLIP_FPS,
      height: size.height,
      length,
      shots: plan.shots.map(({ art, box, keys, pinned }) =>
        pinned === true ? { art, box, keys, pinned } : { art, box, keys }
      ),
      sound,
      width: size.width,
    };
  });

export const momentClip = (
  scene: MomentScene,
  look: ClipLook,
  order: ClipOrder
): Effect.Effect<File, ClipUnavailable | ClipTooSlow> =>
  momentFilm(scene, look, order).pipe(
    Effect.flatMap((film) => {
      const base = {
        budgetMs: order.budgetMs,
        name: clipName(scene.picture, order.frame),
        scale: order.scale ?? 1,
        slot: order.slot,
        support: order.support,
      };

      return filmFile(
        film,
        order.watch === undefined ? base : { ...base, watch: order.watch }
      );
    }),
    Effect.map((made) => made.file)
  );
