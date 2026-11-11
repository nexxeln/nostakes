import { Context, Effect, Layer } from "effect";
import type { Scope, Option } from "effect";
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  canEncodeAudio,
  canEncodeVideo,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSample,
  VideoSampleSource,
} from "mediabunny";

import { MediaFailed } from "./media-failed.js";

export interface PictureSpec {
  readonly bitrate: number;
  readonly codec: string;
  readonly frameRate: number;
  readonly height: number;
  readonly keyFrameSeconds: number;
  readonly width: number;
}

export interface SoundSpec {
  readonly bitrate: number;
  readonly channels: number;
  readonly sampleRate: number;
}

export interface Picture {
  readonly colour: VideoColorSpaceInit;
  readonly i420: Uint8Array<ArrayBuffer>;
  readonly seconds: number;
  readonly lasts: number;
}

export interface Sound {
  readonly planes: readonly Float32Array<ArrayBuffer>[];
  readonly seconds: number;
}

export type AacEncoding = "Native" | "None" | "Polyfill";

export interface Mp4Writer {
  readonly addPicture: (picture: Picture) => Effect.Effect<void, MediaFailed>;
  readonly addSound: (sound: Sound) => Effect.Effect<void, MediaFailed>;
  readonly finished: Effect.Effect<ArrayBuffer, MediaFailed>;
}

export class Media extends Context.Service<
  Media,
  {
    readonly aacEncoding: (spec: SoundSpec) => Effect.Effect<AacEncoding>;
    readonly pictureCodec: (
      spec: Omit<PictureSpec, "codec">
    ) => Effect.Effect<Option.Option<string>>;
    readonly mp4: (spec: {
      readonly picture: PictureSpec;
      readonly sound: SoundSpec | null;
    }) => Effect.Effect<Mp4Writer, MediaFailed, Scope.Scope>;
  }
>()("mediabunny-effect/Media") {}

const failedTo = (step: string) => (cause: unknown) =>
  new MediaFailed({ cause, step });

const memo = <A>(
  cache: Map<string, Effect.Effect<A>>,
  key: string,
  ask: Effect.Effect<A>
) =>
  Effect.suspend(() => {
    const known = cache.get(key);

    if (known !== undefined) {
      return known;
    }

    return Effect.cached(ask).pipe(
      Effect.tap((cached) =>
        Effect.sync(() => {
          cache.set(key, cached);
        })
      ),
      Effect.flatten
    );
  });

const AVC_PROFILES = ["avc1.640028", "avc1.4D4028", "avc1.42E028"] as const;

const encodes = (codec: string, spec: Omit<PictureSpec, "codec">) =>
  Effect.tryPromise(() =>
    canEncodeVideo("avc", {
      fullCodecString: codec,
      height: spec.height,
      quality: new Quality({ bitrate: spec.bitrate, bitrateMode: "variable" }),
      width: spec.width,
    })
  ).pipe(Effect.orElseSucceed(() => false));

const pictureCodec = (spec: Omit<PictureSpec, "codec">) =>
  Effect.findFirst(AVC_PROFILES, (codec) => encodes(codec, spec));

const polyfilledAac = Effect.tryPromise(
  () => import("@mediabunny/aac-encoder")
).pipe(
  Effect.flatMap((extension) =>
    Effect.sync(() => {
      extension.registerAacEncoder();
    })
  ),
  Effect.as<AacEncoding>("Polyfill"),
  Effect.orElseSucceed((): AacEncoding => "None")
);

const aacEncoding = (spec: SoundSpec) =>
  Effect.tryPromise(() =>
    canEncodeAudio("aac", {
      numberOfChannels: spec.channels,
      quality: new Quality({ bitrate: spec.bitrate }),
      sampleRate: spec.sampleRate,
    })
  ).pipe(
    Effect.orElseSucceed(() => false),
    Effect.flatMap((native) =>
      native ? Effect.succeed<AacEncoding>("Native") : polyfilledAac
    )
  );

interface Opened {
  readonly output: Output;
  readonly pictures: VideoSampleSource;
  readonly sounds: AudioSampleSource | null;
  readonly target: BufferTarget;
}

const opened = (spec: {
  readonly picture: PictureSpec;
  readonly sound: SoundSpec | null;
}) =>
  Effect.try({
    catch: failedTo("set up the MP4 output"),
    try: (): Opened => {
      const target = new BufferTarget();

      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: "in-memory" }),
        target,
      });

      const pictures = new VideoSampleSource({
        codec: "avc",
        fullCodecString: spec.picture.codec,
        keyFrameInterval: spec.picture.keyFrameSeconds,
        latencyMode: "quality",
        quality: new Quality({
          bitrate: spec.picture.bitrate,
          bitrateMode: "variable",
        }),
      });

      output.addVideoTrack(pictures, { frameRate: spec.picture.frameRate });

      const sounds =
        spec.sound === null
          ? null
          : new AudioSampleSource({
              codec: "aac",
              quality: new Quality({ bitrate: spec.sound.bitrate }),
            });

      if (sounds !== null) {
        output.addAudioTrack(sounds);
      }

      return { output, pictures, sounds, target };
    },
  });

const cancelled = (output: Output) =>
  output.state === "finalized" || output.state === "canceled"
    ? Effect.void
    : Effect.promise(() => output.cancel()).pipe(Effect.ignore);

const writerOf = (
  open: Opened,
  spec: { readonly picture: PictureSpec; readonly sound: SoundSpec | null }
): Mp4Writer => ({
  addPicture: (picture) =>
    Effect.acquireUseRelease(
      Effect.try({
        catch: failedTo("wrap a picture"),
        try: () =>
          new VideoSample(picture.i420, {
            codedHeight: spec.picture.height,
            codedWidth: spec.picture.width,
            colorSpace: picture.colour,
            duration: picture.lasts,
            format: "I420",
            timestamp: picture.seconds,
          }),
      }),
      (sample) =>
        Effect.tryPromise({
          catch: failedTo("encode a picture"),
          try: () => open.pictures.add(sample),
        }),
      (sample) =>
        Effect.sync(() => {
          sample.close();
        })
    ),
  addSound: (sound) => {
    const { sounds } = open;
    const rate = spec.sound?.sampleRate ?? 0;
    const frames = sound.planes[0]?.length ?? 0;

    if (sounds === null || frames === 0) {
      return Effect.void;
    }

    return Effect.acquireUseRelease(
      Effect.try({
        catch: failedTo("wrap the sound"),
        try: () => {
          const planar = new Float32Array(frames * sound.planes.length);

          for (const [index, plane] of sound.planes.entries()) {
            planar.set(plane.subarray(0, frames), index * frames);
          }

          return new AudioSample({
            data: planar,
            format: "f32-planar",
            numberOfChannels: sound.planes.length,
            sampleRate: rate,
            timestamp: sound.seconds,
          });
        },
      }),
      (sample) =>
        Effect.tryPromise({
          catch: failedTo("encode the sound"),
          try: () => sounds.add(sample),
        }),
      (sample) =>
        Effect.sync(() => {
          sample.close();
        })
    );
  },
  finished: Effect.tryPromise({
    catch: failedTo("finish the MP4 file"),
    try: () => open.output.finalize(),
  }).pipe(
    Effect.flatMap(() =>
      open.target.buffer === null
        ? Effect.fail(failedTo("read the finished file")("no buffer"))
        : Effect.succeed(open.target.buffer)
    )
  ),
});

const mp4 = (spec: {
  readonly picture: PictureSpec;
  readonly sound: SoundSpec | null;
}) =>
  Effect.acquireRelease(
    opened(spec).pipe(
      Effect.tap((open) =>
        Effect.tryPromise({
          catch: failedTo("start the MP4 output"),
          try: () => open.output.start(),
        }).pipe(Effect.onError(() => cancelled(open.output)))
      )
    ),
    (open) => cancelled(open.output)
  ).pipe(Effect.map((open) => writerOf(open, spec)));

export const liveMedia = Layer.sync(Media, () => {
  const pictures = new Map<string, Effect.Effect<Option.Option<string>>>();
  const sounds = new Map<string, Effect.Effect<AacEncoding>>();

  return {
    aacEncoding: (spec) =>
      memo(sounds, JSON.stringify(spec), aacEncoding(spec)),
    mp4,
    pictureCodec: (spec) =>
      memo(pictures, JSON.stringify(spec), pictureCodec(spec)),
  };
});
