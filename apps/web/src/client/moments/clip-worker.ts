import { Effect, Schema } from "effect";

import {
  CLIP_FPS,
  frameMs,
  placementOf,
  poseOf,
} from "../../features/moments/clip-plan.js";
import type {
  Layer,
  Motion,
  Placement,
} from "../../features/moments/clip-plan.js";
import {
  i420Size,
  LIMITED_BT709,
  writeI420,
} from "../../features/moments/i420.js";
import { aacConfig, mp4Of } from "../../features/moments/mp4.js";
import type { AudioTrack, Sample } from "../../features/moments/mp4.js";
import {
  ClipRequestSchema,
  CLIP_AUDIO_CODEC,
  KEY_FRAME_EVERY,
  VIDEO_TIMESCALE,
} from "./clip-wire.js";
import type { ClipReply, ClipRequest } from "./clip-wire.js";

class ClipFailed extends Schema.TaggedError<
  ClipFailed,
  { readonly brand: unique symbol }
>()("ClipFailed", {
  detail: Schema.String,
  step: Schema.String,
}) {}

const failedAt = (step: string) => (cause: unknown) =>
  new ClipFailed({ detail: String(cause), step });

const MICROS = 1_000_000;

const QUEUE_DEPTH = 3;

const placementsAt = (
  layers: readonly Layer[],
  motion: Motion,
  ms: number
): readonly Placement[] =>
  layers.map((layer) => placementOf(layer, poseOf(layer, ms, motion)));

const draw = (
  ctx: OffscreenCanvasRenderingContext2D,
  bands: readonly ImageBitmap[],
  layers: readonly Layer[],
  placements: readonly Placement[]
) => {
  for (const [index, layer] of layers.entries()) {
    const placed = placements[index];
    const source = bands[layer.band];

    if (placed === undefined) {
      continue;
    }

    if (placed.alpha > 0 && source !== undefined) {
      ctx.globalAlpha = placed.alpha;
      ctx.setTransform(...placed.matrix);
      ctx.drawImage(
        source,
        layer.source.x,
        layer.source.y,
        layer.cell.width,
        layer.cell.height,
        placed.at.x,
        placed.at.y,
        layer.cell.width,
        layer.cell.height
      );
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
};

const bytesOf = (chunk: EncodedAudioChunk | EncodedVideoChunk) => {
  const bytes = new Uint8Array(chunk.byteLength);

  chunk.copyTo(bytes);

  return bytes;
};

const drained = (encoder: VideoEncoder) =>
  encoder.encodeQueueSize <= QUEUE_DEPTH
    ? Effect.void
    : Effect.callback<"Drained">((resume) => {
        const go = () => {
          if (encoder.encodeQueueSize <= QUEUE_DEPTH) {
            encoder.removeEventListener("dequeue", go);
            resume(Effect.succeed("Drained"));
          }
        };

        encoder.addEventListener("dequeue", go);

        return Effect.sync(() => {
          encoder.removeEventListener("dequeue", go);
        });
      });

interface Collected {
  avcC: Uint8Array | null;
  failure: string | null;
  last: number;
  readonly samples: Sample[];
}

const videoTrack = (request: ClipRequest) =>
  Effect.gen(function* encodeVideo() {
    const collected: Collected = {
      avcC: null,
      failure: null,
      last: -1,
      samples: [],
    };

    const encoder = yield* Effect.acquireRelease(
      Effect.try({
        catch: failedAt("start the video encoder"),
        try: () =>
          new VideoEncoder({
            error: (failure) => {
              collected.failure = String(failure);
            },
            output: (chunk, metadata) => {
              const description = metadata?.decoderConfig?.description;

              if (description !== undefined && collected.avcC === null) {
                collected.avcC = Uint8Array.from(
                  ArrayBuffer.isView(description)
                    ? new Uint8Array(
                        description.buffer,
                        description.byteOffset,
                        description.byteLength
                      )
                    : new Uint8Array(description)
                );
              }

              if (chunk.timestamp <= collected.last) {
                collected.failure = "the encoder reordered frames";
              }

              collected.last = chunk.timestamp;
              collected.samples.push({
                bytes: bytesOf(chunk),
                duration: VIDEO_TIMESCALE / CLIP_FPS,
                sync: chunk.type === "key",
              });
            },
          }),
      }),
      (opened) =>
        Effect.sync(() => {
          if (opened.state !== "closed") {
            opened.close();
          }
        })
    );

    yield* Effect.try({
      catch: failedAt("configure the video encoder"),
      try: () => {
        encoder.configure({
          avc: { format: "avc" },
          bitrate: request.bitrate,
          bitrateMode: "variable",
          codec: request.codec,
          framerate: CLIP_FPS,
          height: request.height,
          latencyMode: "quality",
          width: request.width,
        });
      },
    });

    const canvas = new OffscreenCanvas(request.width, request.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (ctx === null) {
      return yield* new ClipFailed({
        detail: "no 2D context in this worker",
        step: "draw the frames",
      });
    }

    ctx.imageSmoothingQuality = "high";

    const pixels = new Uint8Array(i420Size(request.width, request.height));
    const drawn = { key: "" };

    for (let frame = 0; frame < request.frames; frame += 1) {
      yield* Effect.try({
        catch: failedAt(`draw and encode frame ${frame}`),
        try: () => {
          const placements = placementsAt(
            request.layers,
            request.motion,
            frameMs(frame)
          );

          const key = JSON.stringify(placements);

          if (key !== drawn.key) {
            draw(ctx, request.bands, request.layers, placements);
            writeI420(
              ctx.getImageData(0, 0, request.width, request.height).data,
              request.width,
              request.height,
              pixels
            );
            drawn.key = key;
          }

          const image = new VideoFrame(pixels, {
            codedHeight: request.height,
            codedWidth: request.width,
            colorSpace: LIMITED_BT709,
            duration: Math.round(MICROS / CLIP_FPS),
            format: "I420",
            timestamp: Math.round(frameMs(frame) * 1000),
          });

          encoder.encode(image, { keyFrame: frame % KEY_FRAME_EVERY === 0 });
          image.close();
        },
      });
      yield* drained(encoder);
    }

    yield* Effect.tryPromise({
      catch: failedAt("finish the video"),
      try: () => encoder.flush(),
    });

    const { avcC, failure, samples } = collected;

    if (
      failure !== null ||
      avcC === null ||
      samples.length !== request.frames
    ) {
      return yield* new ClipFailed({
        detail:
          failure ??
          (avcC === null
            ? "the encoder gave no avcC description"
            : `${samples.length} of ${request.frames} frames came back`),
        step: "encode the video",
      });
    }

    return {
      avcC,
      height: request.height,
      samples,
      timescale: VIDEO_TIMESCALE,
      width: request.width,
    };
  }).pipe(Effect.scoped);

const AAC_FRAME = 1024;

const audioTrack = (sound: NonNullable<ClipRequest["sound"]>) =>
  Effect.gen(function* encodeAudio() {
    const chunks: { bytes: Uint8Array; timestamp: number }[] = [];
    const failures: string[] = [];

    const encoder = yield* Effect.acquireRelease(
      Effect.try({
        catch: failedAt("start the audio encoder"),
        try: () =>
          new AudioEncoder({
            error: (failure) => {
              failures.push(String(failure));
            },
            output: (chunk) => {
              chunks.push({
                bytes: bytesOf(chunk),
                timestamp: chunk.timestamp,
              });
            },
          }),
      }),
      (opened) =>
        Effect.sync(() => {
          if (opened.state !== "closed") {
            opened.close();
          }
        })
    );

    yield* Effect.try({
      catch: failedAt("encode the sting"),
      try: () => {
        encoder.configure({
          bitrate: sound.bitrate,
          codec: CLIP_AUDIO_CODEC,
          numberOfChannels: 1,
          sampleRate: sound.sampleRate,
        });

        const data = new AudioData({
          data: sound.pcm,
          format: "f32-planar",
          numberOfChannels: 1,
          numberOfFrames: sound.pcm.length,
          sampleRate: sound.sampleRate,
          timestamp: 0,
        });

        encoder.encode(data);
        data.close();
      },
    });

    yield* Effect.tryPromise({
      catch: failedAt("finish the sting"),
      try: () => encoder.flush(),
    });

    if (failures.length > 0 || chunks.length === 0) {
      return yield* new ClipFailed({
        detail: failures.join("; ") || "the encoder gave no audio",
        step: "encode the sting",
      });
    }

    const first = chunks[0]?.timestamp ?? 0;

    const track: AudioTrack = {
      bitrate: sound.bitrate,
      channels: 1,
      priming: first < 0 ? Math.round((-first * sound.sampleRate) / MICROS) : 0,
      sampleRate: sound.sampleRate,
      samples: chunks.map((chunk) => ({
        bytes: chunk.bytes,
        duration: AAC_FRAME,
        sync: true,
      })),
      specificConfig: aacConfig(sound.sampleRate, 1),
    };

    return track;
  }).pipe(Effect.scoped);

const made = (request: ClipRequest) =>
  Effect.all([
    videoTrack(request),
    request.sound === null ? Effect.succeed(null) : audioTrack(request.sound),
  ]).pipe(Effect.map(([video, audio]) => mp4Of({ audio, video })));

const reply = (message: ClipReply, transfer: readonly Transferable[]) => {
  globalThis.postMessage(message, { transfer: [...transfer] });
};

globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
  Effect.runFork(
    Schema.decodeUnknownEffect(ClipRequestSchema)(event.data).pipe(
      Effect.mapError(failedAt("read the request")),
      Effect.flatMap(made),
      Effect.match({
        onFailure: (failure) => {
          reply(
            { detail: failure.detail, step: failure.step, tag: "Failed" },
            []
          );
        },
        onSuccess: (bytes) => {
          reply({ bytes, tag: "Made" }, [bytes.buffer]);
        },
      })
    )
  );
});
