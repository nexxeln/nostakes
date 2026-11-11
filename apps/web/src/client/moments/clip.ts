import type { SeatIndex } from "@nostakes/engine";
import { oddsAskedBy, replayOf } from "@nostakes/room";
import type { SeenTableEvent } from "@nostakes/room";
import { Effect, Option, Schema } from "effect";
import type { Scope } from "effect";

import type { Deck, Theme } from "../../features/model.js";
import {
  clipFrames,
  CLIP_FPS,
  CLIP_STAGING,
  stingStartMs,
} from "../../features/moments/clip-plan.js";
import type { MomentPicture } from "../../features/moments/picture.js";
import { spriteMarkup } from "../../features/moments/replay-art.js";
import { replayPlan } from "../../features/moments/replay-plan.js";
import type {
  ReplayPlan,
  ReplaySeat,
} from "../../features/moments/replay-plan.js";
import {
  FAMILIES,
  momentScore,
  scoreLength,
  shiftedScore,
} from "../../features/moments/score.js";
import type { SoundStep } from "../../features/moments/score.js";
import { FRAME_SIZES, paletteFor } from "../../features/pictures/paper.js";
import type { KeptFrame } from "../../features/pictures/paper.js";
import { EMBEDDED_FONTS } from "../pictures/png.js";
import {
  atlasOf,
  ClipUnavailable,
  failedAt,
  replayAtlas,
  spriteAtlas,
} from "./clip-layers.js";
import type { Sprite } from "./clip-layers.js";
import type { PartBox } from "./clip-measure.js";
import { CLIP_AUDIO_CODEC, ClipReplySchema } from "./clip-wire.js";
import type { ClipReply, ClipRequest, WorkerRequest } from "./clip-wire.js";
import { renderScore } from "./synth.js";

export { ClipUnavailable } from "./clip-layers.js";

export type { PartBox } from "./clip-measure.js";

const VIDEO_CODECS = ["avc1.640028", "avc1.4D4028", "avc1.42E028"];

const VIDEO_BITRATE = 3_000_000;

const REPLAY_BITRATE = 2_000_000;

const startsTheReplay = (role: string) =>
  role === "base" || CLIP_STAGING.landed.has(role);

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
    : Effect.succeedNone;

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

const rendered = (
  steps: readonly SoundStep[],
  seconds: number,
  slot: Effect.Effect<void>
) =>
  renderScore(
    steps,
    { channels: 1, sampleRate: SOUND_RATE, seconds },
    slot
  ).pipe(
    Effect.map((sound) => ({
      bitrate: SOUND_BITRATE,
      pcm: sound.getChannelData(0),
      sampleRate: SOUND_RATE,
    })),
    Effect.mapError(failedAt("render the sound"))
  );

interface ClipWorker {
  readonly ask: (
    request: WorkerRequest,
    transfer: readonly Transferable[]
  ) => Effect.Effect<ClipReply, ClipUnavailable>;
}

const clipWorker: Effect.Effect<ClipWorker, ClipUnavailable, Scope.Scope> =
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
    Effect.map((worker) => ({
      ask: (request: WorkerRequest, transfer: readonly Transferable[]) =>
        Effect.callback<unknown, ClipUnavailable>((resume) => {
          const heard = (event: MessageEvent<unknown>) => {
            resume(Effect.succeed(event.data));
          };

          const broke = (event: ErrorEvent) => {
            resume(Effect.fail(failedAt("run the clip worker")(event.message)));
          };

          worker.addEventListener("message", heard, { once: true });
          worker.addEventListener("error", broke, { once: true });
          worker.postMessage(request, { transfer: [...transfer] });

          return Effect.sync(() => {
            worker.removeEventListener("message", heard);
            worker.removeEventListener("error", broke);
          });
        }).pipe(
          Effect.flatMap((reply) =>
            Schema.decodeUnknownEffect(ClipReplySchema)(reply).pipe(
              Effect.mapError(failedAt("read the clip worker's reply"))
            )
          ),
          Effect.flatMap((reply) =>
            reply.tag === "Failed"
              ? Effect.fail(
                  new ClipUnavailable({
                    detail: reply.detail,
                    step: reply.step,
                  })
                )
              : Effect.succeed(reply)
          )
        ),
    }))
  );

const encoded = (worker: ClipWorker, request: Omit<ClipRequest, "kind">) =>
  worker
    .ask(
      { ...request, kind: "Frames" },
      request.sound === null
        ? request.bands
        : [...request.bands, request.sound.pcm.buffer]
    )
    .pipe(
      Effect.flatMap((reply) =>
        reply.tag === "Made"
          ? Effect.succeed(reply.bytes)
          : Effect.fail(
              new ClipUnavailable({
                detail: "the worker answered something else",
                step: "encode the clip",
              })
            )
      )
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

const motionOf = (picture: MomentPicture) => ({
  family: FAMILIES[picture.kind],
  tier: picture.tier,
});

export const clipFile = (
  picture: MomentPicture,
  order: ClipOrder
): Effect.Effect<File, ClipUnavailable> =>
  Effect.gen(function* clip() {
    const { frame, slot, support } = order;
    const size = FRAME_SIZES[frame];

    const atlas = yield* atlasOf(
      order.svg,
      { boxes: order.boxes, fonts: EMBEDDED_FONTS, from: () => 0, size },
      slot
    );

    const motion = motionOf(picture);
    const stingAt = stingStartMs(motion.family, CLIP_STAGING);

    const sting = shiftedScore(
      momentScore(picture.kind, picture.tier),
      stingAt / 1000
    );

    const frames = clipFrames(atlas.layers, motion, scoreLength(sting) * 1000);

    const sound = support.sound
      ? yield* rendered(sting, frames / CLIP_FPS, slot)
      : null;

    const worker = yield* clipWorker;

    const bytes = yield* encoded(worker, {
      bands: atlas.bands,
      bitrate: VIDEO_BITRATE,
      codec: support.codec,
      frames,
      height: size.height,
      layers: atlas.layers,
      motion,
      sound,
      width: size.width,
    });

    return new File([bytes], clipName(picture, frame), { type: "video/mp4" });
  }).pipe(Effect.scoped);

export interface ReplayOrder extends ClipOrder {
  readonly lead: SeatIndex;
  readonly record: readonly SeenTableEvent[];
  readonly seats: readonly ReplaySeat[];
}

const SPRITES_PER_SLOT = 6;

const chancesOf = (worker: ClipWorker, record: readonly SeenTableEvent[]) =>
  Effect.all(
    oddsAskedBy(record).map((asked) =>
      worker
        .ask({ board: asked.board, holes: asked.holes, kind: "Chances" }, [])
        .pipe(
          Effect.map(
            (reply) =>
              [
                JSON.stringify(asked),
                reply.tag === "Chances" ? reply.percents : [],
              ] as const
          )
        )
    )
  ).pipe(Effect.map((answers) => new Map(answers)));

const markupsOf = (
  plan: ReplayPlan,
  look: { readonly deck: Deck; readonly theme: Theme },
  slot: Effect.Effect<void>
) =>
  Effect.gen(function* drawSprites() {
    const palette = paletteFor(look.theme, look.deck);
    const sprites: Sprite[] = [];

    for (const [index, sprite] of plan.sprites.entries()) {
      if (index % SPRITES_PER_SLOT === 0) {
        yield* slot;
      }

      sprites.push({
        ...spriteMarkup(palette, look.theme, sprite.art),
        keys: sprite.keys,
      });
    }

    return sprites;
  });

export const replayFile = (
  picture: MomentPicture,
  look: { readonly deck: Deck; readonly theme: Theme },
  order: ReplayOrder
): Effect.Effect<File, ClipUnavailable> =>
  Effect.gen(function* replayClip() {
    const { frame, slot, support } = order;
    const size = FRAME_SIZES[frame];
    const worker = yield* clipWorker;
    const percents = yield* chancesOf(worker, order.record);

    yield* slot;

    const replay = yield* Effect.fromOption(
      replayOf(
        order.record,
        (asked) => percents.get(JSON.stringify(asked)) ?? []
      )
    ).pipe(
      Effect.mapError(
        () =>
          new ClipUnavailable({
            detail: "the hand did not end in what this device saw",
            step: "tell the hand",
          })
      )
    );

    const plan = replayPlan(replay, { lead: order.lead, seats: order.seats });

    const card = yield* atlasOf(
      order.svg,
      {
        boxes: order.boxes,
        fonts: EMBEDDED_FONTS,
        from: (role) => (startsTheReplay(role) ? 0 : plan.cardAt),
        size,
      },
      slot
    );

    const sprites = yield* spriteAtlas(
      yield* markupsOf(plan, look, slot),
      EMBEDDED_FONTS,
      slot
    );

    const atlas = replayAtlas(card, sprites);
    const motion = motionOf(picture);
    const frames = Math.ceil((plan.length * CLIP_FPS) / 1000);

    const sound = support.sound
      ? yield* rendered(
          [
            ...plan.cues,
            ...shiftedScore(
              momentScore(picture.kind, picture.tier),
              (plan.cardAt + stingStartMs(motion.family, CLIP_STAGING)) / 1000
            ),
          ],
          frames / CLIP_FPS,
          slot
        )
      : null;

    const bytes = yield* encoded(worker, {
      bands: atlas.bands,
      bitrate: REPLAY_BITRATE,
      codec: support.codec,
      frames,
      height: size.height,
      layers: atlas.layers,
      motion,
      sound,
      width: size.width,
    });

    return new File([bytes], clipName(picture, frame), { type: "video/mp4" });
  }).pipe(Effect.scoped);
