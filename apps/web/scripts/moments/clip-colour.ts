import { Effect, Option } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

import { sequenceOf } from "../../src/features/moments/sps.ts";
import type { VideoColour } from "../../src/features/moments/sps.ts";

export const COLOUR_GAP = 8;

const VERMILION = [239, 83, 38] as const;

const NEAR = 6;

const SMALLEST_PATCH = 200;

const PAPER_SPOT = 8;

const SAMPLE_ENTRY_FIELDS = 78;

interface Box {
  readonly body: number;
  readonly end: number;
  readonly type: string;
}

const boxesIn = (bytes: Uint8Array, from: number, to: number) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const found: Box[] = [];
  let at = from;

  while (at + 8 <= to) {
    const size = view.getUint32(at);

    found.push({
      body: at + 8,
      end: at + size,
      type: String.fromCodePoint(...bytes.subarray(at + 4, at + 8)),
    });
    at += Math.max(8, size);
  }

  return found;
};

const path = (
  bytes: Uint8Array,
  from: Box | undefined,
  types: readonly string[]
) => {
  let box = from;

  for (const type of types) {
    box =
      box === undefined
        ? undefined
        : boxesIn(bytes, box.body, box.end).find((each) => each.type === type);
  }

  return box;
};

export interface Declared {
  readonly colr: VideoColour | null;
  readonly stream: VideoColour | null;
}

export const declaredColour = (bytes: Uint8Array): Declared => {
  const moov = boxesIn(bytes, 0, bytes.length).find(
    (box) => box.type === "moov"
  );

  const stsd = path(bytes, moov, ["trak", "mdia", "minf", "stbl", "stsd"]);

  const entry =
    stsd === undefined ? undefined : boxesIn(bytes, stsd.body + 8, stsd.end)[0];

  const inner =
    entry === undefined
      ? []
      : boxesIn(bytes, entry.body + SAMPLE_ENTRY_FIELDS, entry.end);

  const avcC = inner.find((box) => box.type === "avcC");
  const colr = inner.find((box) => box.type === "colr");
  const view = new DataView(bytes.buffer, bytes.byteOffset);

  return {
    colr:
      colr === undefined
        ? null
        : {
            fullRange: (bytes[colr.body + 10] ?? 0) >= 128,
            matrix: view.getUint16(colr.body + 8),
            primaries: view.getUint16(colr.body + 4),
            transfer: view.getUint16(colr.body + 6),
          },
    stream:
      avcC === undefined
        ? null
        : (sequenceOf(bytes.subarray(avcC.body, avcC.end))?.colour ?? null),
  };
};

export const declaredText = (colour: VideoColour | null) =>
  colour === null
    ? "nothing"
    : `${colour.fullRange ? "full" : "limited"} range, primaries ${colour.primaries}, transfer ${colour.transfer}, matrix ${colour.matrix}`;

export interface Picture {
  readonly channels: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly width: number;
}

const colourAt = (picture: Picture, pixel: number) => {
  const at = pixel * picture.channels;

  return [
    picture.pixels[at] ?? 0,
    picture.pixels[at + 1] ?? 0,
    picture.pixels[at + 2] ?? 0,
  ] as const;
};

const near = (
  one: readonly [number, number, number],
  other: readonly [number, number, number]
) => one.every((value, index) => Math.abs(value - (other[index] ?? 0)) <= NEAR);

const patchOf = (still: Picture, target: readonly [number, number, number]) => {
  const inside: number[] = [];
  const { height, width } = still;

  for (let row = 1; row < height - 1; row += 1) {
    for (let col = 1; col < width - 1; col += 1) {
      const pixel = row * width + col;

      if (
        [pixel, pixel - 1, pixel + 1, pixel - width, pixel + width].every(
          (each) => near(colourAt(still, each), target)
        )
      ) {
        inside.push(pixel);
      }
    }
  }

  return inside;
};

const meanOf = (picture: Picture, pixels: readonly number[]) => {
  const sum = [0, 0, 0];

  for (const pixel of pixels) {
    const [r, g, b] = colourAt(picture, pixel);

    sum[0] = (sum[0] ?? 0) + r;
    sum[1] = (sum[1] ?? 0) + g;
    sum[2] = (sum[2] ?? 0) + b;
  }

  return sum.map((value) => Math.round(value / Math.max(1, pixels.length)));
};

export interface Swatch {
  readonly clip: readonly number[];
  readonly gap: number;
  readonly pixels: number;
  readonly still: readonly number[];
}

const swatch = (
  still: Picture,
  clip: Picture,
  pixels: readonly number[]
): Swatch => {
  const want = meanOf(still, pixels);
  const got = meanOf(clip, pixels);

  return {
    clip: got,
    gap: Math.max(
      ...want.map((value, index) => Math.abs(value - (got[index] ?? 0)))
    ),
    pixels: pixels.length,
    still: want,
  };
};

export interface Swatches {
  readonly paper: Swatch;
  readonly vermilion: Swatch;
}

export const swatchesOf = (still: Picture, clip: Picture): Swatches => ({
  paper: swatch(
    still,
    clip,
    patchOf(still, colourAt(still, PAPER_SPOT * still.width + PAPER_SPOT))
  ),
  vermilion: swatch(still, clip, patchOf(still, VERMILION)),
});

export const swatchProblems = (where: string, found: Swatches) =>
  (["paper", "vermilion"] as const).flatMap((name) => {
    const { clip, gap, pixels, still } = found[name];

    if (pixels < SMALLEST_PATCH) {
      return [`${where}: found only ${pixels} pixels of ${name} to compare`];
    }

    return gap > COLOUR_GAP
      ? [
          `${where}: ${name} comes out as ${clip.join(",")} against ${still.join(",")} in the still, ${gap} apart`,
        ]
      : [];
  });

export const swatchText = (found: Swatches) =>
  `paper ${found.paper.clip.join(",")} (still ${found.paper.still.join(",")}), vermilion ${found.vermilion.clip.join(",")} (still ${found.vermilion.still.join(",")})`;

const LUMA_SCALE = 255 / 219;

const CHROMA_SCALE = 255 / 224;

const clamp = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

export const assumedLimitedBt709 = (
  yuv: Uint8Array,
  width: number,
  height: number
): Picture => {
  const pixels = new Uint8Array(width * height * 3);
  const half = width / 2;
  const blueAt = width * height;
  const redAt = blueAt + half * (height / 2);

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const chroma = Math.floor(row / 2) * half + Math.floor(col / 2);
      const luma = ((yuv[row * width + col] ?? 16) - 16) * LUMA_SCALE;
      const blue = ((yuv[blueAt + chroma] ?? 128) - 128) * CHROMA_SCALE;
      const red = ((yuv[redAt + chroma] ?? 128) - 128) * CHROMA_SCALE;
      const at = (row * width + col) * 3;

      pixels[at] = clamp(luma + 1.5748 * red);
      pixels[at + 1] = clamp(luma - 0.1873 * blue - 0.4681 * red);
      pixels[at + 2] = clamp(luma + 1.8556 * blue);
    }
  }

  return { channels: 3, height, pixels, width };
};

const ffmpegFrame = (
  input: string,
  out: string,
  last: number,
  format: string
) =>
  ChildProcessSpawner.pipe(
    Effect.flatMap((spawner) =>
      spawner.exitCode(
        ChildProcess.make("ffmpeg", [
          "-v",
          "error",
          "-y",
          "-i",
          input,
          "-vf",
          `select=eq(n\\,${last})`,
          "-frames:v",
          "1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          format,
          out,
        ])
      )
    )
  );

export const ffmpegSwatches = (
  clip: string,
  still: Picture,
  facts: {
    readonly frames: number;
    readonly fullRange: boolean;
    readonly height: number;
    readonly width: number;
  }
) =>
  Effect.gen(function* decodeWithFfmpeg() {
    const fs = yield* FileSystem.FileSystem;
    const honoured = `${clip}.honoured.rgb`;
    const raw = `${clip}.planes.yuv`;
    const last = facts.frames - 1;

    const codes = yield* Effect.all([
      ffmpegFrame(clip, honoured, last, "rgb24"),
      ffmpegFrame(clip, raw, last, facts.fullRange ? "yuvj420p" : "yuv420p"),
    ]);

    if (codes.some((code) => code !== 0)) {
      return Option.none();
    }

    const honouredPixels = yield* fs.readFile(honoured);
    const planes = yield* fs.readFile(raw);

    yield* Effect.all([fs.remove(honoured), fs.remove(raw)]);

    return Option.some({
      honours: swatchesOf(still, {
        channels: 3,
        height: facts.height,
        pixels: honouredPixels,
        width: facts.width,
      }),
      ignores: swatchesOf(
        still,
        assumedLimitedBt709(planes, facts.width, facts.height)
      ),
    });
  }).pipe(Effect.orElseSucceed(() => Option.none()));
