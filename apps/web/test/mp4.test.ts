import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { aacConfig, mp4Of } from "../src/features/moments/mp4.js";
import type { Movie, Sample } from "../src/features/moments/mp4.js";

interface Found {
  readonly body: number;
  readonly end: number;
  readonly type: string;
}

const typeAt = (bytes: Uint8Array, at: number) =>
  String.fromCodePoint(...bytes.subarray(at, at + 4));

const boxesIn = (bytes: Uint8Array, from: number, to: number) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const found: Found[] = [];
  let at = from;

  while (at < to) {
    const size = view.getUint32(at);

    found.push({ body: at + 8, end: at + size, type: typeAt(bytes, at + 4) });
    at += Math.max(8, size);
  }

  return found;
};

const child = (bytes: Uint8Array, parent: Found, path: readonly string[]) => {
  let current: Found | undefined = parent;

  for (const type of path) {
    current =
      current === undefined
        ? undefined
        : boxesIn(bytes, current.body, current.end).find(
            (each) => each.type === type
          );
  }

  if (current === undefined) {
    throw new Error(`no ${path.join("/")} box`);
  }

  return current;
};

const fullBody = (box: Found) => box.body + 4;

const u32s = (bytes: Uint8Array, at: number, count: number) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset);

  return Array.from({ length: count }, (_, index) =>
    view.getUint32(at + index * 4)
  );
};

const table = (bytes: Uint8Array, box: Found, width: number) => {
  const [count = 0] = u32s(bytes, fullBody(box), 1);

  return Array.from({ length: count }, (_, index) =>
    u32s(bytes, fullBody(box) + 4 + index * width * 4, width)
  );
};

interface ReadTrack {
  readonly durations: readonly number[];
  readonly handler: string;
  readonly samples: readonly Uint8Array[];
  readonly segment: number | null;
  readonly skip: number;
  readonly sync: readonly number[] | null;
  readonly timescale: number;
}

const readTrack = (bytes: Uint8Array, trak: Found): ReadTrack => {
  const stbl = child(bytes, trak, ["mdia", "minf", "stbl"]);
  const mdhd = child(bytes, trak, ["mdia", "mdhd"]);
  const hdlr = child(bytes, trak, ["mdia", "hdlr"]);
  const timescale = u32s(bytes, fullBody(mdhd), 3)[2] ?? 0;
  const sizesBox = child(bytes, stbl, ["stsz"]);
  const [, count = 0] = u32s(bytes, fullBody(sizesBox), 2);
  const sizes = u32s(bytes, fullBody(sizesBox) + 8, count);
  const offsets = table(bytes, child(bytes, stbl, ["stco"]), 1).flat();
  const perChunk = table(bytes, child(bytes, stbl, ["stsc"]), 3);
  const samples: Uint8Array[] = [];
  let next = 0;

  for (const [chunkIndex, offset] of offsets.entries()) {
    const entry = perChunk.findLast(([first = 0]) => first <= chunkIndex + 1);
    let at = offset;

    for (let index = 0; index < (entry?.[1] ?? 0); index += 1) {
      const size = sizes[next] ?? 0;

      samples.push(bytes.subarray(at, at + size));
      at += size;
      next += 1;
    }
  }

  const durations = table(bytes, child(bytes, stbl, ["stts"]), 2).flatMap(
    ([times = 0, delta = 0]) => Array.from({ length: times }, () => delta)
  );

  const syncBox = boxesIn(bytes, stbl.body, stbl.end).find(
    (each) => each.type === "stss"
  );

  const edit = boxesIn(bytes, trak.body, trak.end).find(
    (each) => each.type === "edts"
  );

  const [segment = null, skip = 0] =
    edit === undefined
      ? []
      : u32s(bytes, fullBody(child(bytes, edit, ["elst"])) + 4, 2);

  return {
    durations,
    handler: typeAt(bytes, fullBody(hdlr) + 4),
    samples,
    segment,
    skip,
    sync: syncBox === undefined ? null : table(bytes, syncBox, 1).flat(),
    timescale,
  };
};

const read = (bytes: Uint8Array) => {
  const top = boxesIn(bytes, 0, bytes.length);
  const moov = top.find((each) => each.type === "moov");

  if (moov === undefined) {
    throw new Error("no moov box");
  }

  const header = u32s(bytes, fullBody(child(bytes, moov, ["mvhd"])), 4);
  const timescale = header[2] ?? 0;
  const duration = header[3] ?? 0;

  return {
    duration: duration / timescale,
    order: top.map((each) => each.type),
    size: top.at(-1)?.end ?? 0,
    tracks: boxesIn(bytes, moov.body, moov.end)
      .filter((each) => each.type === "trak")
      .map((trak) => readTrack(bytes, trak)),
  };
};

const filled = (track: number, index: number, size: number) =>
  Uint8Array.from(
    { length: size },
    (_, at) => (track * 89 + index * 31 + at) % 256
  );

const SampleSchema = Schema.Struct({
  duration: Schema.Int.check(Schema.isBetween({ maximum: 4000, minimum: 1 })),
  size: Schema.Int.check(Schema.isBetween({ maximum: 600, minimum: 1 })),
  sync: Schema.Boolean,
});

const movies = Arbitrary.schema(
  Schema.Struct({
    audio: Schema.NullOr(
      Schema.Struct({
        playable: Schema.NullOr(
          Schema.Int.check(Schema.isBetween({ maximum: 400_000, minimum: 1 }))
        ),
        priming: Schema.Int.check(
          Schema.isBetween({ maximum: 2112, minimum: 0 })
        ),
        samples: Schema.Array(SampleSchema).check(
          Schema.isMinLength(1),
          Schema.isMaxLength(200)
        ),
      })
    ),
    video: Schema.Array(SampleSchema).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(160)
    ),
  })
);

type Plan = typeof movies extends Arbitrary.Arbitrary<infer A> ? A : never;

const samplesFor = (
  track: number,
  plan: readonly (typeof SampleSchema.Type)[]
): readonly Sample[] =>
  plan.map((sample, index) => ({
    bytes: filled(track, index, sample.size),
    duration: sample.duration,
    sync: index === 0 || sample.sync,
  }));

const editOf = (audio: NonNullable<Movie["audio"]>) => {
  const total = audio.samples.reduce((sum, sample) => sum + sample.duration, 0);

  const played = Math.max(
    0,
    Math.min(audio.playable ?? total - audio.priming, total - audio.priming)
  );

  return audio.priming > 0 || played !== total
    ? Math.round((played * 1000) / audio.sampleRate)
    : null;
};

const movieOf = (plan: Plan): Movie => ({
  audio:
    plan.audio === null
      ? null
      : {
          bitrate: 96_000,
          channels: 1,
          playable: plan.audio.playable,
          priming: plan.audio.priming,
          sampleRate: 48_000,
          samples: samplesFor(2, plan.audio.samples),
          specificConfig: aacConfig(48_000, 1),
        },
  video: {
    avcC: Uint8Array.of(1, 0x64, 0, 0x28, 0xff, 0xe1),
    height: 1350,
    samples: samplesFor(1, plan.video),
    timescale: 30_000,
    width: 1080,
  },
});

const seconds = (samples: readonly Sample[], timescale: number) =>
  samples.reduce((total, sample) => total + sample.duration, 0) / timescale;

const colrOf = (avcC: Uint8Array) => {
  const bytes = mp4Of({
    audio: null,
    video: {
      ...movieOf({
        audio: null,
        video: [{ duration: 1000, size: 4, sync: true }],
      }).video,
      avcC,
    },
  });

  const moov = boxesIn(bytes, 0, bytes.length).find(
    (each) => each.type === "moov"
  );

  if (moov === undefined) {
    return null;
  }

  const stsd = child(bytes, moov, ["trak", "mdia", "minf", "stbl", "stsd"]);
  const [avc1] = boxesIn(bytes, fullBody(stsd) + 4, stsd.end);

  const found =
    avc1 === undefined
      ? undefined
      : boxesIn(bytes, avc1.body + 78, avc1.end).find(
          (each) => each.type === "colr"
        );

  return found === undefined
    ? null
    : [...bytes.subarray(found.body, found.end)];
};

describe("the clip's MP4 file", () => {
  it.prop(
    "puts the movie header before the media, so a player can start before the file has arrived",
    { plan: movies },
    ({ plan }) => {
      const bytes = mp4Of(movieOf(plan));

      expect(read(bytes)).toMatchObject({
        order: ["ftyp", "moov", "mdat"],
        size: bytes.length,
      });
    }
  );

  it.prop(
    "points every sample table entry at exactly the bytes of that sample",
    { plan: movies },
    ({ plan }) => {
      const movie = movieOf(plan);
      const [video, audio] = read(mp4Of(movie)).tracks;

      expect({
        audio: audio?.samples,
        video: video?.samples,
      }).toStrictEqual({
        audio: movie.audio?.samples.map((sample) => sample.bytes),
        video: movie.video.samples.map((sample) => sample.bytes),
      });
    }
  );

  it.prop(
    "keeps each sample's duration, the key frames, the sound's priming to skip, and plays exactly the sound it was given",
    { plan: movies },
    ({ plan }) => {
      const movie = movieOf(plan);
      const found = read(mp4Of(movie));

      expect(
        found.tracks.map(({ samples: _samples, ...timing }) => timing)
      ).toStrictEqual([
        {
          durations: movie.video.samples.map((sample) => sample.duration),
          handler: "vide",
          segment: null,
          skip: 0,
          sync: movie.video.samples.flatMap((sample, index) =>
            sample.sync ? [index + 1] : []
          ),
          timescale: 30_000,
        },
        ...(movie.audio === null
          ? []
          : [
              {
                durations: movie.audio.samples.map((sample) => sample.duration),
                handler: "soun",
                segment: editOf(movie.audio),
                skip: movie.audio.priming,
                sync: null,
                timescale: 48_000,
              },
            ]),
      ]);
    }
  );

  it.prop(
    "lasts as long as its longest track as played, to the millisecond",
    { plan: movies },
    ({ plan }) => {
      const movie = movieOf(plan);

      const longest = Math.max(
        seconds(movie.video.samples, 30_000),
        movie.audio === null
          ? 0
          : (editOf(movie.audio) ??
              seconds(movie.audio.samples, 48_000) * 1000) / 1000
      );

      expect(Math.abs(read(mp4Of(movie)).duration - longest)).toBeLessThan(
        0.0006
      );
    }
  );

  it("declares the colour the H.264 stream declares, in a colr box beside the avcC", () => {
    const limited = Uint8Array.from(
      "01640c28ffe1001467640c28ac18d0088055f2cd35010d010784423501000468ce3c80fdf8f800"
        .match(/../gu)
        ?.map((pair) => Number.parseInt(pair, 16)) ?? []
    );

    expect({
      declared: colrOf(limited),
      undeclared: colrOf(Uint8Array.of(1, 0x64, 0, 0x28, 0xff, 0xe1)),
    }).toStrictEqual({
      declared: [0x6e, 0x63, 0x6c, 0x78, 0, 1, 0, 13, 0, 1, 0],
      undeclared: null,
    });
  });

  it("describes AAC-LC at the sound's rate and channels in the two bytes a decoder reads", () => {
    expect([
      [...aacConfig(48_000, 1)],
      [...aacConfig(44_100, 2)],
      [...aacConfig(24_000, 1)],
    ]).toStrictEqual([
      [0x11, 0x88],
      [0x12, 0x10],
      [0x13, 0x08],
    ]);
  });

  it("refuses a rate AAC cannot name", () => {
    expect(() => aacConfig(45_000, 1)).toThrow(/45000 Hz/u);
  });
});
