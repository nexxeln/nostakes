import { tableChances } from "@nostakes/room";
import { Effect, Option, Schema } from "effect";

import { frameTime, samePlace } from "../../features/moments/film.js";
import type { Box, Placed } from "../../features/moments/film.js";
import {
  BGRA_ORDER,
  i420Size,
  LIMITED_BT709,
  RGBA_ORDER,
  writeI420Area,
} from "../../features/moments/i420.js";
import type { Channels } from "../../features/moments/i420.js";
import { aacConfig, mp4Parts } from "../../features/moments/mp4.js";
import type { AudioTrack, Sample } from "../../features/moments/mp4.js";
import { drawAreas, placementsAt } from "./clip-draw.js";
import {
  CLIP_AUDIO_CODEC,
  KEY_FRAME_EVERY,
  VIDEO_TIMESCALE,
  WorkerRequestSchema,
} from "./clip-wire.js";
import type { ClipReply, FilmRequest, WorkerRequest } from "./clip-wire.js";

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

const QUEUE_DEPTH = 2;

const PROGRESS_EVERY = 15;

const SNAPSHOT_SHARE = 0.25;

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

const reply = (message: ClipReply, transfer: readonly Transferable[]) => {
  globalThis.postMessage(message, { transfer: [...transfer] });
};

const SNAPSHOT_ORDERS = new Map<string, Channels>([
  ["BGRA", BGRA_ORDER],
  ["BGRX", BGRA_ORDER],
  ["RGBA", RGBA_ORDER],
  ["RGBX", RGBA_ORDER],
]);

const snapshotOrder = (canvas: OffscreenCanvas): Option.Option<Channels> => {
  try {
    const probe = new VideoFrame(canvas, { timestamp: 0 });
    const order = Option.fromNullishOr(SNAPSHOT_ORDERS.get(probe.format ?? ""));

    probe.close();

    return order;
  } catch {
    return Option.none();
  }
};

const areaOf = (box: Box) => box.width * box.height;

const DIGEST_BASE = 257;

const DIGEST_PRIME = 2_147_483_647;

const DIGEST_START = 1;

const digestOf = (hash: number, bytes: Uint8Array) => {
  let next = hash;

  for (const byte of bytes) {
    next = (next * DIGEST_BASE + byte + 1) % DIGEST_PRIME;
  }

  return next;
};

interface Reading {
  readonly canvas: OffscreenCanvas;
  readonly ctx: OffscreenCanvasRenderingContext2D;
  readonly frame: { readonly height: number; readonly width: number };
  readonly pixels: Uint8Array;
  readonly scratch: Uint8Array;
  readonly snapshot: Option.Option<Channels>;
}

const readByImageData = (reading: Reading, areas: readonly Box[]) => {
  for (const area of areas) {
    const image = reading.ctx.getImageData(
      area.x,
      area.y,
      area.width,
      area.height
    );

    writeI420Area(
      {
        bytes: image.data,
        offset: 0,
        order: RGBA_ORDER,
        stride: area.width * 4,
      },
      area,
      reading.frame,
      reading.pixels
    );
  }
};

const readBySnapshot = (
  reading: Reading,
  order: Channels,
  areas: readonly Box[]
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => new VideoFrame(reading.canvas, { timestamp: 0 })),
    (snapshot) =>
      Effect.forEach(
        areas,
        (area) =>
          Effect.promise(() =>
            snapshot.copyTo(reading.scratch, { rect: area })
          ).pipe(
            Effect.map(([plane]) =>
              writeI420Area(
                {
                  bytes: reading.scratch,
                  offset: plane?.offset ?? 0,
                  order,
                  stride: plane?.stride ?? area.width * 4,
                },
                area,
                reading.frame,
                reading.pixels
              )
            )
          ),
        { discard: true }
      ),
    (snapshot) =>
      Effect.sync(() => {
        snapshot.close();
      })
  );

const readAreas = (reading: Reading, areas: readonly Box[]) => {
  const share =
    areas.reduce((total, area) => total + areaOf(area), 0) /
    (reading.frame.width * reading.frame.height);

  return Option.match(reading.snapshot, {
    onNone: () =>
      Effect.sync(() => {
        readByImageData(reading, areas);
      }),
    onSome: (order) =>
      share >= SNAPSHOT_SHARE
        ? readBySnapshot(reading, order, areas)
        : Effect.sync(() => {
            readByImageData(reading, areas);
          }),
  });
};

const moved = (before: readonly Placed[] | null, now: readonly Placed[]) =>
  before === null ||
  now.some((placed, index) => {
    const earlier = before[index];

    return earlier === undefined || !samePlace(earlier, placed);
  });

interface Drawn {
  before: readonly Placed[] | null;
  digest: number;
  redrawn: number;
}

const videoTrack = (request: FilmRequest) =>
  Effect.gen(function* encodeVideo() {
    const collected: Collected = {
      avcC: null,
      failure: null,
      last: -1,
      samples: [],
    };

    const frameTicks = VIDEO_TIMESCALE / request.fps;

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
                duration: frameTicks,
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
          framerate: request.fps,
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

    const frame = { height: request.height, width: request.width };

    const reading: Reading = {
      canvas,
      ctx,
      frame,
      pixels: new Uint8Array(i420Size(request.width, request.height)),
      scratch: new Uint8Array(request.width * request.height * 4),
      snapshot: snapshotOrder(canvas),
    };

    const whole: readonly Box[] = [{ ...frame, x: 0, y: 0 }];

    const drawn: Drawn = { before: null, digest: DIGEST_START, redrawn: 0 };

    for (let index = 0; index < request.frames; index += 1) {
      const ms = frameTime(index, request.fps);
      const placements = placementsAt(request, ms);

      const areas =
        request.redraw === "Whole" || moved(drawn.before, placements)
          ? whole
          : [];

      if (areas.length > 0) {
        yield* Effect.try({
          catch: failedAt(`draw frame ${index}`),
          try: () => {
            drawAreas(ctx, request.bands, request, placements, areas);
          },
        });
        yield* readAreas(reading, areas);
        drawn.redrawn += 1;
      }

      drawn.before = placements;

      if (request.digest) {
        drawn.digest = digestOf(drawn.digest, reading.pixels);
      }

      yield* Effect.try({
        catch: failedAt(`encode frame ${index}`),
        try: () => {
          const image = new VideoFrame(reading.pixels, {
            codedHeight: request.height,
            codedWidth: request.width,
            colorSpace: LIMITED_BT709,
            duration: Math.round(MICROS / request.fps),
            format: "I420",
            timestamp: Math.round(ms * 1000),
          });

          encoder.encode(image, { keyFrame: index % KEY_FRAME_EVERY === 0 });
          image.close();
        },
      });
      yield* drained(encoder);

      if ((index + 1) % PROGRESS_EVERY === 0) {
        reply({ made: index + 1, tag: "Progress" }, []);
      }
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
      digest: request.digest ? drawn.digest.toString(16) : null,
      redrawn: drawn.redrawn,
      track: {
        avcC,
        height: request.height,
        samples,
        timescale: VIDEO_TIMESCALE,
        width: request.width,
      },
    };
  }).pipe(Effect.scoped);

const AAC_FRAME = 1024;

const PIECE_SECONDS = 1;

const audioTrack = (sound: NonNullable<FilmRequest["sound"]>) =>
  Effect.gen(function* encodeAudio() {
    const chunks: { bytes: Uint8Array<ArrayBuffer>; timestamp: number }[] = [];
    const failures: string[] = [];
    const count = sound.channels.length;
    const length = sound.channels[0]?.length ?? 0;

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
      catch: failedAt("encode the sound"),
      try: () => {
        encoder.configure({
          bitrate: sound.bitrate,
          codec: CLIP_AUDIO_CODEC,
          numberOfChannels: count,
          sampleRate: sound.sampleRate,
        });

        const piece = sound.sampleRate * PIECE_SECONDS;

        for (let start = 0; start < length; start += piece) {
          const frames = Math.min(piece, length - start);
          const planar = new Float32Array(frames * count);

          for (const [index, channel] of sound.channels.entries()) {
            planar.set(channel.subarray(start, start + frames), index * frames);
          }

          const data = new AudioData({
            data: planar,
            format: "f32-planar",
            numberOfChannels: count,
            numberOfFrames: frames,
            sampleRate: sound.sampleRate,
            timestamp: Math.round((start * MICROS) / sound.sampleRate),
          });

          encoder.encode(data);
          data.close();
        }
      },
    });

    yield* Effect.tryPromise({
      catch: failedAt("finish the sound"),
      try: () => encoder.flush(),
    });

    if (failures.length > 0 || chunks.length === 0) {
      return yield* new ClipFailed({
        detail: failures.join("; ") || "the encoder gave no audio",
        step: "encode the sound",
      });
    }

    const first = chunks[0]?.timestamp ?? 0;

    const track: AudioTrack = {
      bitrate: sound.bitrate,
      channels: count,
      priming: first < 0 ? Math.round((-first * sound.sampleRate) / MICROS) : 0,
      sampleRate: sound.sampleRate,
      samples: chunks.map((chunk) => ({
        bytes: chunk.bytes,
        duration: AAC_FRAME,
        sync: true,
      })),
      specificConfig: aacConfig(sound.sampleRate, count),
    };

    return track;
  }).pipe(Effect.scoped);

const made = (request: FilmRequest) =>
  Effect.all([
    videoTrack(request),
    request.sound === null ? Effect.succeed(null) : audioTrack(request.sound),
  ]).pipe(
    Effect.map(([video, audio]) => ({
      digest: video.digest,
      file: new Blob([...mp4Parts({ audio, video: video.track })], {
        type: "video/mp4",
      }),
      redrawn: video.redrawn,
    }))
  );

const answered = (request: WorkerRequest) =>
  request.kind === "Chances"
    ? Effect.sync(() => {
        reply(
          {
            percents: tableChances({
              board: request.board,
              holes: request.holes,
            }),
            tag: "Chances",
          },
          []
        );
      })
    : made(request).pipe(
        Effect.flatMap(({ digest, file, redrawn }) =>
          Effect.sync(() => {
            reply({ digest, file, redrawn, tag: "Made" }, []);
          })
        )
      );

globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
  Effect.runFork(
    Schema.decodeUnknownEffect(WorkerRequestSchema)(event.data).pipe(
      Effect.mapError(failedAt("read the request")),
      Effect.flatMap(answered),
      Effect.catchTag("ClipFailed", (failure) =>
        Effect.sync(() => {
          reply(
            { detail: failure.detail, step: failure.step, tag: "Failed" },
            []
          );
        })
      )
    )
  );
});
