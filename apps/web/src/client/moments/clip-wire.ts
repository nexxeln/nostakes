import { Schema } from "effect";

export const VIDEO_TIMESCALE = 30_000;

export const KEY_FRAME_EVERY = 60;

export const CLIP_AUDIO_CODEC = "mp4a.40.2";

const PointSchema = Schema.Struct({ x: Schema.Finite, y: Schema.Finite });

const LayerSchema = Schema.Struct({
  band: Schema.Int,
  cell: Schema.Struct({
    height: Schema.Int,
    width: Schema.Int,
    x: Schema.Int,
    y: Schema.Int,
  }),
  centre: PointSchema,
  index: Schema.Int,
  role: Schema.String,
  source: PointSchema,
});

export const ClipRequestSchema = Schema.Struct({
  bands: Schema.Array(Schema.instanceOf(ImageBitmap)),
  bitrate: Schema.Int,
  codec: Schema.String,
  frames: Schema.Int,
  height: Schema.Int,
  layers: Schema.Array(LayerSchema),
  motion: Schema.Struct({
    family: Schema.Literals(["Celebration", "Groan", "Relief", "Reveal"]),
    tier: Schema.Literals([1, 2, 3]),
  }),
  sound: Schema.NullOr(
    Schema.Struct({
      bitrate: Schema.Int,
      pcm: Schema.instanceOf(Float32Array),
      sampleRate: Schema.Int,
    })
  ),
  width: Schema.Int,
});

export type ClipRequest = typeof ClipRequestSchema.Type;

export const ClipReplySchema = Schema.Union([
  Schema.Struct({
    bytes: Schema.instanceOf(Uint8Array),
    tag: Schema.Literal("Made"),
  }),
  Schema.Struct({
    detail: Schema.String,
    step: Schema.String,
    tag: Schema.Literal("Failed"),
  }),
]);

export type ClipReply = typeof ClipReplySchema.Type;
