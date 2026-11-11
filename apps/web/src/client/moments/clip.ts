import { Effect, Option, Schema } from "effect";

import {
  clipFrames,
  CLIP_FPS,
  CLIP_STAGING,
  stingStartMs,
} from "../../features/moments/clip-plan.js";
import type { MomentPicture } from "../../features/moments/picture.js";
import {
  FAMILIES,
  momentScore,
  scoreLength,
  shiftedScore,
} from "../../features/moments/score.js";
import { FRAME_SIZES } from "../../features/pictures/paper.js";
import type { KeptFrame } from "../../features/pictures/paper.js";
import { EMBEDDED_FONTS } from "../pictures/png.js";
import { atlasOf, ClipUnavailable, failedAt } from "./clip-layers.js";
import type { PartBox } from "./clip-measure.js";
import { CLIP_AUDIO_CODEC, ClipReplySchema } from "./clip-wire.js";
import type { ClipRequest } from "./clip-wire.js";
import { renderScore } from "./synth.js";

export { ClipUnavailable } from "./clip-layers.js";

export type { PartBox } from "./clip-measure.js";

const VIDEO_CODECS = ["avc1.640028", "avc1.4D4028", "avc1.42E028"];

const VIDEO_BITRATE = 3_000_000;

const SOUND_RATE = 48_000;

const SOUND_BITRATE = 96_000;

export interface ClipSupport {
  readonly codec: string;
  readonly sound: boolean;
}

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

const aacSupported =
  "AudioEncoder" in globalThis
    ? Effect.tryPromise(() =>
        AudioEncoder.isConfigSupported({
          bitrate: SOUND_BITRATE,
          codec: CLIP_AUDIO_CODEC,
          numberOfChannels: 1,
          sampleRate: SOUND_RATE,
        })
      ).pipe(
        Effect.map((found) => found.supported === true),
        Effect.orElseSucceed(() => false)
      )
    : Effect.succeed(false);

export const clipSupport = (
  frame: KeptFrame
): Effect.Effect<Option.Option<ClipSupport>> =>
  hasEncoders()
    ? Effect.all([videoCodec(FRAME_SIZES[frame]), aacSupported]).pipe(
        Effect.map(([codec, sound]) =>
          codec.pipe(Option.map((found) => ({ codec: found, sound })))
        )
      )
    : Effect.succeed(Option.none());

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

const stingOf = (
  picture: MomentPicture,
  timing: { readonly seconds: number; readonly startMs: number },
  slot: Effect.Effect<void>
) =>
  renderScore(
    shiftedScore(
      momentScore(picture.kind, picture.tier),
      timing.startMs / 1000
    ),
    { channels: 1, sampleRate: SOUND_RATE, seconds: timing.seconds },
    slot
  ).pipe(
    Effect.map((rendered) => rendered.getChannelData(0)),
    Effect.mapError(failedAt("render the sting"))
  );

const worked = (request: ClipRequest, transfer: readonly Transferable[]) =>
  Effect.acquireRelease(
    Effect.try({
      catch: failedAt("start the clip worker"),
      try: () =>
        new Worker(new URL("clip-worker.ts", import.meta.url), {
          name: "nostakes-clip",
          type: "module",
        }),
    }),
    (worker) =>
      Effect.sync(() => {
        worker.terminate();
      })
  ).pipe(
    Effect.flatMap((worker) =>
      Effect.callback<unknown, ClipUnavailable>((resume) => {
        worker.addEventListener("message", (event) => {
          resume(Effect.succeed(event.data));
        });
        worker.addEventListener("error", (event) => {
          resume(Effect.fail(failedAt("run the clip worker")(event.message)));
        });
        worker.postMessage(request, { transfer: [...transfer] });
      })
    ),
    Effect.flatMap((reply) =>
      Schema.decodeUnknownEffect(ClipReplySchema)(reply).pipe(
        Effect.mapError(failedAt("read the clip worker's reply"))
      )
    ),
    Effect.flatMap((reply) =>
      reply.tag === "Made"
        ? Effect.succeed(reply.bytes)
        : Effect.fail(
            new ClipUnavailable({ detail: reply.detail, step: reply.step })
          )
    ),
    Effect.scoped
  );

export const clipName = (picture: MomentPicture, frame: KeptFrame) =>
  `nostakes-${picture.title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}${frame === "Story" ? "-story" : ""}.mp4`;

export interface ClipOrder {
  readonly boxes: readonly PartBox[];
  readonly frame: KeptFrame;
  readonly slot: Effect.Effect<void>;
  readonly support: ClipSupport;
  readonly svg: string;
}

export const clipFile = (
  picture: MomentPicture,
  order: ClipOrder
): Effect.Effect<File, ClipUnavailable> =>
  Effect.gen(function* clip() {
    const { frame, support } = order;
    const size = FRAME_SIZES[frame];
    const { slot } = order;

    const atlas = yield* atlasOf(
      order.svg,
      { boxes: order.boxes, fonts: EMBEDDED_FONTS, size },
      slot
    );

    const motion = { family: FAMILIES[picture.kind], tier: picture.tier };
    const stingAt = stingStartMs(motion.family, CLIP_STAGING);

    const stingMs =
      stingAt + scoreLength(momentScore(picture.kind, picture.tier)) * 1000;

    const frames = clipFrames(atlas.layers, motion, stingMs);

    const sound = support.sound
      ? yield* stingOf(
          picture,
          { seconds: frames / CLIP_FPS, startMs: stingAt },
          slot
        ).pipe(
          Effect.map((pcm) => ({
            bitrate: SOUND_BITRATE,
            pcm,
            sampleRate: SOUND_RATE,
          }))
        )
      : null;

    const bytes = yield* worked(
      {
        bands: atlas.bands,
        bitrate: VIDEO_BITRATE,
        codec: support.codec,
        frames,
        height: size.height,
        layers: atlas.layers,
        motion,
        sound,
        width: size.width,
      },
      sound === null ? atlas.bands : [...atlas.bands, sound.pcm.buffer]
    );

    return new File([bytes], clipName(picture, frame), { type: "video/mp4" });
  });
