export interface Sample {
  readonly bytes: Uint8Array;
  readonly duration: number;
  readonly sync: boolean;
}

export interface VideoTrack {
  readonly avcC: Uint8Array;
  readonly height: number;
  readonly samples: readonly Sample[];
  readonly timescale: number;
  readonly width: number;
}

export interface AudioTrack {
  readonly bitrate: number;
  readonly channels: number;
  readonly priming: number;
  readonly sampleRate: number;
  readonly samples: readonly Sample[];
  readonly specificConfig: Uint8Array;
}

export interface Movie {
  readonly audio: AudioTrack | null;
  readonly video: VideoTrack;
}

export const MOVIE_TIMESCALE = 1000;

export const CHUNK_SECONDS = 0.5;

const concat = (parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0)
  );

  let at = 0;

  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }

  return out;
};

const written = (bytes: number, write: (view: DataView) => void) => {
  const out = new Uint8Array(bytes);

  write(new DataView(out.buffer));

  return out;
};

const u8 = (value: number) =>
  written(1, (view) => {
    view.setUint8(0, value);
  });

const u16 = (value: number) =>
  written(2, (view) => {
    view.setUint16(0, value);
  });

const u32 = (value: number) =>
  written(4, (view) => {
    view.setUint32(0, value);
  });

const u24 = (value: number) => u32(value).subarray(1);

const AAC_RATES: readonly number[] = [
  96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000,
  12_000, 11_025, 8000, 7350,
];

const AAC_LC = 2;

const OBJECT_TYPE_PLACE = 2 ** 11;

const RATE_PLACE = 2 ** 7;

const CHANNELS_PLACE = 2 ** 3;

export const aacConfig = (sampleRate: number, channels: number) => {
  const index = AAC_RATES.indexOf(sampleRate);

  if (index === -1) {
    throw new RangeError(
      `AAC has no sampling frequency index for ${sampleRate} Hz. Render the sound at one of ${AAC_RATES.join(", ")} Hz.`
    );
  }

  return u16(
    AAC_LC * OBJECT_TYPE_PLACE + index * RATE_PLACE + channels * CHANNELS_PLACE
  );
};

const zeros = (length: number) => new Uint8Array(length);

const ascii = (text: string) =>
  Uint8Array.from(text, (letter) => letter.codePointAt(0) ?? 0);

const box = (type: string, ...parts: readonly Uint8Array[]) => {
  const body = concat(parts);

  return concat([u32(8 + body.length), ascii(type), body]);
};

const fullBox = (
  type: string,
  version: number,
  flags: number,
  ...parts: readonly Uint8Array[]
) => box(type, u8(version), u24(flags), ...parts);

const UNITY_MATRIX = concat(
  [0x00_01_00_00, 0, 0, 0, 0x00_01_00_00, 0, 0, 0, 0x40_00_00_00].map(u32)
);

const UNDETERMINED_LANGUAGE = 0x55_c4;

const ENABLED_IN_MOVIE = 0x00_00_03;

const SELF_CONTAINED = 0x00_00_01;

interface Track {
  readonly duration: number;
  readonly id: number;
  readonly samples: readonly Sample[];
  readonly timescale: number;
}

interface Chunk {
  readonly first: number;
  readonly count: number;
  readonly start: number;
  readonly track: number;
}

const decodeTimes = (samples: readonly Sample[]) => {
  let at = 0;

  return samples.map((sample) => {
    const start = at;

    at += sample.duration;

    return start;
  });
};

const chunksOf = (track: Track): readonly Chunk[] => {
  const span = CHUNK_SECONDS * track.timescale;
  const times = decodeTimes(track.samples);
  const chunks: Chunk[] = [];

  for (const [index, time] of times.entries()) {
    const open = chunks.at(-1);

    if (open !== undefined && time < open.start * track.timescale + span) {
      chunks[chunks.length - 1] = { ...open, count: open.count + 1 };
    } else {
      chunks.push({
        count: 1,
        first: index,
        start: time / track.timescale,
        track: track.id,
      });
    }
  }

  return chunks;
};

const runs = (values: readonly number[]) => {
  const out: [number, number][] = [];

  for (const value of values) {
    const last = out.at(-1);

    if (last !== undefined && last[1] === value) {
      last[0] += 1;
    } else {
      out.push([1, value]);
    }
  }

  return out;
};

const stts = (samples: readonly Sample[]) => {
  const entries = runs(samples.map((sample) => sample.duration));

  return fullBox(
    "stts",
    0,
    0,
    u32(entries.length),
    ...entries.flatMap(([count, delta]) => [u32(count), u32(delta)])
  );
};

const stss = (samples: readonly Sample[]) => {
  const numbers = samples.flatMap((sample, index) =>
    sample.sync ? [index + 1] : []
  );

  return fullBox("stss", 0, 0, u32(numbers.length), ...numbers.map(u32));
};

const stsc = (chunks: readonly Chunk[]) => {
  const entries: (readonly [number, number])[] = [];

  for (const [index, chunk] of chunks.entries()) {
    if (entries.at(-1)?.[1] !== chunk.count) {
      entries.push([index + 1, chunk.count]);
    }
  }

  return fullBox(
    "stsc",
    0,
    0,
    u32(entries.length),
    ...entries.flatMap(([first, count]) => [u32(first), u32(count), u32(1)])
  );
};

const stsz = (samples: readonly Sample[]) =>
  fullBox(
    "stsz",
    0,
    0,
    u32(0),
    u32(samples.length),
    ...samples.map((sample) => u32(sample.bytes.length))
  );

const stco = (offsets: readonly number[]) =>
  fullBox("stco", 0, 0, u32(offsets.length), ...offsets.map(u32));

const dinf = () =>
  box(
    "dinf",
    fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, SELF_CONTAINED))
  );

const mdhd = (track: Track) =>
  fullBox(
    "mdhd",
    0,
    0,
    u32(0),
    u32(0),
    u32(track.timescale),
    u32(track.duration),
    u16(UNDETERMINED_LANGUAGE),
    u16(0)
  );

const hdlr = (handler: "soun" | "vide", name: string) =>
  fullBox("hdlr", 0, 0, u32(0), ascii(handler), zeros(12), ascii(name), u8(0));

const movieDuration = (track: Track) =>
  Math.round((track.duration * MOVIE_TIMESCALE) / track.timescale);

const tkhd = (
  track: Track,
  look: {
    readonly height: number;
    readonly volume: number;
    readonly width: number;
  }
) =>
  fullBox(
    "tkhd",
    0,
    ENABLED_IN_MOVIE,
    u32(0),
    u32(0),
    u32(track.id),
    u32(0),
    u32(movieDuration(track)),
    zeros(8),
    u16(0),
    u16(0),
    u16(look.volume),
    u16(0),
    UNITY_MATRIX,
    u32(look.width * 0x1_00_00),
    u32(look.height * 0x1_00_00)
  );

const avc1 = (video: VideoTrack) =>
  box(
    "avc1",
    zeros(6),
    u16(1),
    zeros(16),
    u16(video.width),
    u16(video.height),
    u32(0x00_48_00_00),
    u32(0x00_48_00_00),
    u32(0),
    u16(1),
    zeros(32),
    u16(0x00_18),
    u16(0xff_ff),
    box("avcC", video.avcC)
  );

const descriptor = (tag: number, ...parts: readonly Uint8Array[]) => {
  const body = concat(parts);

  return concat([u8(tag), u8(body.length), body]);
};

const AUDIO_ISO_14496_3 = 0x40;

const AUDIO_STREAM_UPWARD_RESERVED = 0x15;

const MP4_SYNC_LAYER = 0x02;

const esds = (audio: AudioTrack) =>
  fullBox(
    "esds",
    0,
    0,
    descriptor(
      0x03,
      u16(0),
      u8(0),
      descriptor(
        0x04,
        u8(AUDIO_ISO_14496_3),
        u8(AUDIO_STREAM_UPWARD_RESERVED),
        u24(0),
        u32(audio.bitrate),
        u32(audio.bitrate),
        descriptor(0x05, audio.specificConfig)
      ),
      descriptor(0x06, u8(MP4_SYNC_LAYER))
    )
  );

const mp4a = (audio: AudioTrack) =>
  box(
    "mp4a",
    zeros(6),
    u16(1),
    zeros(8),
    u16(audio.channels),
    u16(16),
    u16(0),
    u16(0),
    u32(audio.sampleRate * 0x1_00_00),
    esds(audio)
  );

const elst = (track: Track, skip: number) =>
  box(
    "edts",
    fullBox(
      "elst",
      0,
      0,
      u32(1),
      u32(
        Math.round(
          ((track.duration - skip) * MOVIE_TIMESCALE) / track.timescale
        )
      ),
      u32(skip),
      u16(1),
      u16(0)
    )
  );

const trackBox = (
  track: Track,
  parts: {
    readonly chunks: readonly Chunk[];
    readonly entry: Uint8Array;
    readonly header: Uint8Array;
    readonly kind: "Audio" | "Video";
    readonly offsets: readonly number[];
    readonly skip: number;
  }
) => {
  const video = parts.kind === "Video";

  return box(
    "trak",
    parts.header,
    parts.skip > 0 ? elst(track, parts.skip) : new Uint8Array(0),
    box(
      "mdia",
      mdhd(track),
      video ? hdlr("vide", "nostakes moment") : hdlr("soun", "nostakes sting"),
      box(
        "minf",
        video
          ? fullBox("vmhd", 0, 1, u16(0), zeros(6))
          : fullBox("smhd", 0, 0, u16(0), u16(0)),
        dinf(),
        box(
          "stbl",
          fullBox("stsd", 0, 0, u32(1), parts.entry),
          stts(track.samples),
          video ? stss(track.samples) : new Uint8Array(0),
          stsc(parts.chunks),
          stsz(track.samples),
          stco(parts.offsets)
        )
      )
    )
  );
};

const FTYP = box(
  "ftyp",
  ascii("isom"),
  u32(0x2_00),
  ascii("isom"),
  ascii("iso2"),
  ascii("avc1"),
  ascii("mp41")
);

const totalDuration = (samples: readonly Sample[]) =>
  samples.reduce((total, sample) => total + sample.duration, 0);

const VIDEO_ID = 1;

const AUDIO_ID = 2;

const bytesOf = (track: Track, chunk: Chunk) =>
  track.samples
    .slice(chunk.first, chunk.first + chunk.count)
    .reduce((total, sample) => total + sample.bytes.length, 0);

export const mp4Of = (movie: Movie): Uint8Array<ArrayBuffer> => {
  const { audio, video } = movie;

  const tracks: Track[] = [
    {
      duration: totalDuration(video.samples),
      id: VIDEO_ID,
      samples: video.samples,
      timescale: video.timescale,
    },
    ...(audio === null
      ? []
      : [
          {
            duration: totalDuration(audio.samples),
            id: AUDIO_ID,
            samples: audio.samples,
            timescale: audio.sampleRate,
          },
        ]),
  ];

  const order = tracks
    .flatMap(chunksOf)
    .toSorted(
      (one, other) => one.start - other.start || one.track - other.track
    );

  const chunksFor = (id: number) => order.filter((chunk) => chunk.track === id);

  const moovFor = (offsets: ReadonlyMap<Chunk, number>) => {
    const offsetsOf = (id: number) =>
      order.flatMap((chunk) =>
        chunk.track === id ? [offsets.get(chunk) ?? 0] : []
      );

    const longest = Math.max(...tracks.map(movieDuration));

    return box(
      "moov",
      fullBox(
        "mvhd",
        0,
        0,
        u32(0),
        u32(0),
        u32(MOVIE_TIMESCALE),
        u32(longest),
        u32(0x00_01_00_00),
        u16(0x01_00),
        zeros(10),
        UNITY_MATRIX,
        zeros(24),
        u32(tracks.length + 1)
      ),
      ...tracks.map((track) =>
        track.id === VIDEO_ID
          ? trackBox(track, {
              chunks: chunksFor(track.id),
              entry: avc1(video),
              header: tkhd(track, {
                height: video.height,
                volume: 0,
                width: video.width,
              }),
              kind: "Video",
              offsets: offsetsOf(track.id),
              skip: 0,
            })
          : trackBox(track, {
              chunks: chunksFor(track.id),
              entry: audio === null ? new Uint8Array(0) : mp4a(audio),
              header: tkhd(track, { height: 0, volume: 0x01_00, width: 0 }),
              kind: "Audio",
              offsets: offsetsOf(track.id),
              skip: audio?.priming ?? 0,
            })
      )
    );
  };

  const placed = (start: number) => {
    const offsets = new Map<Chunk, number>();
    let at = start;

    for (const chunk of order) {
      offsets.set(chunk, at);
      const track = tracks.find((each) => each.id === chunk.track);

      at += track === undefined ? 0 : bytesOf(track, chunk);
    }

    return offsets;
  };

  const sizedMoov = moovFor(placed(0));
  const moov = moovFor(placed(FTYP.length + sizedMoov.length + 8));

  const payload = order.flatMap((chunk) => {
    const track = tracks.find((each) => each.id === chunk.track);

    return (track?.samples ?? [])
      .slice(chunk.first, chunk.first + chunk.count)
      .map((sample) => sample.bytes);
  });

  return concat([FTYP, moov, box("mdat", ...payload)]);
};
