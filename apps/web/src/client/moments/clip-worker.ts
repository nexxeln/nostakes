import { tableChances } from "@nostakes/room";
import { Effect, Option, Schema } from "effect";

import {
  changedAreas,
  frameTime,
  videoBitrate,
} from "../../features/moments/film.js";
import type { Box, Placed } from "../../features/moments/film.js";
import {
  BGRA_ORDER,
  i420Size,
  LIMITED_BT709,
  RGBA_ORDER,
  writeI420Area,
} from "../../features/moments/i420.js";
import type { Channels } from "../../features/moments/i420.js";
import { drawAreas, placementsAt } from "./clip-draw.js";
import { WorkerRequestSchema } from "./clip-wire.js";
import type { ClipReply, FilmRequest, WorkerRequest } from "./clip-wire.js";
import { liveMedia, Media, mediaWithoutNativeAac } from "./mediabunny/index.js";
import type { MediaFailed, Mp4Writer } from "./mediabunny/index.js";
import { isCloseRequest } from "./worker-close.js";

class ClipFailed extends Schema.TaggedError<
  ClipFailed,
  { readonly brand: unique symbol }
>()("ClipFailed", {
  detail: Schema.String,
  step: Schema.String,
}) {}

const failedAt = (step: string) => (cause: unknown) =>
  new ClipFailed({ detail: String(cause), step });

const PROGRESS_EVERY = 15;

const SNAPSHOT_SHARE = 0.25;

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

interface Compared {
  frames: number;
  most: number;
  pixels: number;
}

const comparedLuma = (
  compared: Compared,
  drawn: Uint8Array,
  whole: Uint8Array,
  count: number
) => {
  let pixels = 0;

  for (let at = 0; at < count; at += 1) {
    const gap = Math.abs((drawn[at] ?? 0) - (whole[at] ?? 0));

    if (gap > 0) {
      pixels += 1;
      compared.most = Math.max(compared.most, gap);
    }
  }

  compared.pixels += pixels;
  compared.frames += pixels > 0 ? 1 : 0;
};

interface Reading {
  readonly canvas: OffscreenCanvas;
  readonly ctx: OffscreenCanvasRenderingContext2D;
  readonly frame: { readonly height: number; readonly width: number };
  readonly pixels: Uint8Array<ArrayBuffer>;
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

interface Drawn {
  before: readonly Placed[] | null;
  redrawn: number;
}

const KEY_FRAME_SECONDS = 2;

const SOUND_PIECE_SECONDS = 1;

const failedInMedia = (failure: MediaFailed) =>
  new ClipFailed({ detail: String(failure.cause), step: failure.step });

const motionOf = (request: FilmRequest) => {
  const sizes = request.shots.map((shot) => shot.size);
  const frame = { height: request.height, width: request.width };
  const area = frame.width * frame.height;
  let before = placementsAt(request, frameTime(0, request.fps));
  let changed = 0;

  for (let index = 1; index < request.frames; index += 1) {
    const now = placementsAt(request, frameTime(index, request.fps));

    changed += changedAreas(sizes, before, now, frame).reduce(
      (total, box) => total + areaOf(box),
      0
    );
    before = now;
  }

  return request.frames > 1 ? changed / (area * (request.frames - 1)) : 0;
};

const bitrateOf = (request: FilmRequest) =>
  request.bitrate ??
  videoBitrate(
    {
      fps: request.fps,
      height: request.height,
      length: frameTime(request.frames, request.fps),
      width: request.width,
    },
    motionOf(request)
  );

const pictureSpecOf = (request: FilmRequest, bitrate: number) => ({
  bitrate,
  frameRate: request.fps,
  height: request.height,
  keyFrameSeconds: KEY_FRAME_SECONDS,
  width: request.width,
});

const codecFor = (request: FilmRequest, bitrate: number) =>
  Media.use((media) =>
    media.pictureCodec(pictureSpecOf(request, bitrate))
  ).pipe(
    Effect.flatMap((codec) =>
      Option.match(codec, {
        onNone: () =>
          Effect.fail(
            new ClipFailed({
              detail: `this browser cannot encode H.264 at ${request.width} by ${request.height}`,
              step: "choose the video codec",
            })
          ),
        onSome: (found) => Effect.succeed(found),
      })
    )
  );

const soundFor = (request: FilmRequest) => {
  const { sound } = request;

  if (sound === null) {
    return Effect.succeed(null);
  }

  return Media.use((media) =>
    media.aacEncoding({
      bitrate: sound.bitrate,
      channels: sound.channels.length,
      sampleRate: sound.sampleRate,
    })
  ).pipe(Effect.map((encoding) => (encoding === "None" ? null : sound)));
};

const soundIn = (writer: Mp4Writer, sound: NonNullable<FilmRequest["sound"]>) =>
  Effect.gen(function* feedSound() {
    const piece = sound.sampleRate * SOUND_PIECE_SECONDS;
    const length = sound.channels[0]?.length ?? 0;

    for (let start = 0; start < length; start += piece) {
      yield* writer.addSound({
        planes: sound.channels.map((channel) =>
          channel.subarray(start, Math.min(length, start + piece))
        ),
        seconds: start / sound.sampleRate,
      });
    }
  });

const made = (request: FilmRequest) =>
  Effect.gen(function* makeFilm() {
    const bitrate = bitrateOf(request);
    const codec = yield* codecFor(request, bitrate);
    const sound = yield* soundFor(request);

    const writer = yield* Media.use((media) =>
      media.mp4({
        picture: { ...pictureSpecOf(request, bitrate), codec },
        playFor: request.frames / request.fps,
        sound:
          sound === null
            ? null
            : {
                bitrate: sound.bitrate,
                channels: sound.channels.length,
                sampleRate: sound.sampleRate,
              },
      })
    );

    if (sound !== null) {
      yield* soundIn(writer, sound);
    }

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

    const sizes = request.shots.map((shot) => shot.size);
    const whole: readonly Box[] = [{ ...frame, x: 0, y: 0 }];
    const drawn: Drawn = { before: null, redrawn: 0 };
    const compared: Compared = { frames: 0, most: 0, pixels: 0 };

    const witness = request.compare
      ? new OffscreenCanvas(request.width, request.height).getContext("2d", {
          willReadFrequently: true,
        })
      : null;

    const witnessed = new Uint8Array(
      request.compare ? i420Size(request.width, request.height) : 0
    );

    reply({ made: 0, tag: "Progress" }, []);

    for (let index = 0; index < request.frames; index += 1) {
      const ms = frameTime(index, request.fps);
      const placements = placementsAt(request, ms);

      const areas =
        request.redraw === "Whole"
          ? whole
          : changedAreas(sizes, drawn.before, placements, frame);

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

      if (witness !== null) {
        drawAreas(witness, request.bands, request, placements, whole);
        writeI420Area(
          {
            bytes: witness.getImageData(0, 0, request.width, request.height)
              .data,
            offset: 0,
            order: RGBA_ORDER,
            stride: request.width * 4,
          },
          whole[0] ?? { ...frame, x: 0, y: 0 },
          frame,
          witnessed
        );
        comparedLuma(
          compared,
          reading.pixels,
          witnessed,
          request.width * request.height
        );
      }

      yield* writer.addPicture({
        colour: LIMITED_BT709,
        i420: reading.pixels,
        lasts: 1 / request.fps,
        seconds: ms / 1000,
      });

      if ((index + 1) % PROGRESS_EVERY === 0) {
        reply({ made: index + 1, tag: "Progress" }, []);
      }
    }

    const bytes = yield* writer.finished;

    return {
      compared: request.compare ? compared : null,
      file: new Blob([bytes], { type: "video/mp4" }),
      redrawn: drawn.redrawn,
    };
  }).pipe(
    Effect.scoped,
    Effect.catchTag("MediaFailed", (failure) =>
      Effect.fail(failedInMedia(failure))
    ),
    Effect.provide(
      request.aac === "Extension" ? mediaWithoutNativeAac : liveMedia
    )
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
        Effect.flatMap(({ compared, file, redrawn }) =>
          Effect.sync(() => {
            reply({ compared, file, redrawn, tag: "Made" }, []);
          })
        )
      );

globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (isCloseRequest(event.data)) {
    globalThis.close();

    return;
  }

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
