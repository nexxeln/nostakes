import { CardSchema } from "@nostakes/engine";
import { Schema } from "effect";

export const VIDEO_TIMESCALE = 30_000;

export const KEY_FRAME_EVERY = 60;

export const CLIP_AUDIO_CODEC = "mp4a.40.2";

const PointSchema = Schema.Struct({ x: Schema.Finite, y: Schema.Finite });

const PoseSchema = Schema.Struct({
  dx: Schema.Finite,
  dy: Schema.Finite,
  opacity: Schema.Finite,
  scale: Schema.Finite,
  squeeze: Schema.Finite,
  turn: Schema.Finite,
});

const LayerSchema = Schema.Struct({
  band: Schema.Int,
  cell: Schema.Struct({
    height: Schema.Int,
    width: Schema.Int,
    x: Schema.Int,
    y: Schema.Int,
  }),
  centre: PointSchema,
  from: Schema.Finite,
  index: Schema.Int,
  keys: Schema.Array(Schema.Struct({ at: Schema.Finite, pose: PoseSchema })),
  role: Schema.String,
  source: PointSchema,
});

export const ChancesRequestSchema = Schema.Struct({
  board: Schema.Array(CardSchema),
  holes: Schema.Array(Schema.Array(CardSchema)),
  kind: Schema.Literal("Chances"),
});

export const ClipRequestSchema = Schema.Struct({
  bands: Schema.Array(Schema.instanceOf(ImageBitmap)),
  bitrate: Schema.Int,
  codec: Schema.String,
  frames: Schema.Int,
  height: Schema.Int,
  kind: Schema.Literal("Frames"),
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

export const WorkerRequestSchema = Schema.Union([
  ChancesRequestSchema,
  ClipRequestSchema,
]);

export type WorkerRequest = typeof WorkerRequestSchema.Type;

export const ClipReplySchema = Schema.Union([
  Schema.Struct({
    percents: Schema.Array(Schema.Int),
    tag: Schema.Literal("Chances"),
  }),
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
