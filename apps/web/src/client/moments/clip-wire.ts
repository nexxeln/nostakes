import { CardSchema } from "@nostakes/engine";
import { Schema } from "effect";

const PointSchema = Schema.Struct({ x: Schema.Finite, y: Schema.Finite });

const PoseSchema = Schema.Struct({
  dx: Schema.Finite,
  dy: Schema.Finite,
  opacity: Schema.Finite,
  scale: Schema.Finite,
  squeeze: Schema.Finite,
  turn: Schema.Finite,
});

const KeySchema = Schema.Struct({
  at: Schema.Finite,
  ease: Schema.optionalKey(
    Schema.Literals(["Hold", "In", "InOut", "Linear", "Out"])
  ),
  pose: PoseSchema,
});

const BoxSchema = Schema.Struct({
  height: Schema.Int,
  width: Schema.Int,
  x: Schema.Int,
  y: Schema.Int,
});

const DrawnShotSchema = Schema.Struct({
  band: Schema.Int,
  box: BoxSchema,
  keys: Schema.Array(KeySchema),
  pinned: Schema.Boolean,
  pivot: PointSchema,
  size: Schema.Struct({ height: Schema.Int, width: Schema.Int }),
  source: PointSchema,
});

export const ChancesRequestSchema = Schema.Struct({
  board: Schema.Array(CardSchema),
  holes: Schema.Array(Schema.Array(CardSchema)),
  kind: Schema.Literal("Chances"),
});

export const FilmRequestSchema = Schema.Struct({
  aac: Schema.Literals(["Browser", "Extension"]),
  bands: Schema.Array(Schema.instanceOf(ImageBitmap)),
  bitrate: Schema.NullOr(Schema.Int),
  camera: Schema.Array(KeySchema),
  compare: Schema.Boolean,
  fps: Schema.Literals([24, 25, 30]),
  frames: Schema.Int,
  height: Schema.Int,
  kind: Schema.Literal("Film"),
  redraw: Schema.Literals(["Changed", "Whole"]),
  scale: Schema.Finite,
  shots: Schema.Array(DrawnShotSchema),
  sound: Schema.NullOr(
    Schema.Struct({
      bitrate: Schema.Int,
      channels: Schema.Array(Schema.instanceOf(Float32Array)),
      sampleRate: Schema.Int,
    })
  ),
  width: Schema.Int,
});

export type FilmRequest = typeof FilmRequestSchema.Type;

export const WorkerRequestSchema = Schema.Union([
  ChancesRequestSchema,
  FilmRequestSchema,
]);

export type WorkerRequest = typeof WorkerRequestSchema.Type;

export const HoldRequestSchema = Schema.Struct({
  held: Schema.Boolean,
  kind: Schema.Literal("Hold"),
});

export const isHoldRequest = Schema.is(HoldRequestSchema);

export const ClipReplySchema = Schema.Union([
  Schema.Struct({
    percents: Schema.Array(Schema.Int),
    tag: Schema.Literal("Chances"),
  }),
  Schema.Struct({
    compared: Schema.NullOr(
      Schema.Struct({
        frames: Schema.Int,
        most: Schema.Int,
        pixels: Schema.Int,
      })
    ),
    file: Schema.instanceOf(Blob),
    redrawn: Schema.Int,
    tag: Schema.Literal("Made"),
  }),
  Schema.Struct({
    made: Schema.Int,
    tag: Schema.Literal("Progress"),
  }),
  Schema.Struct({
    detail: Schema.String,
    step: Schema.String,
    tag: Schema.Literal("Failed"),
  }),
]);

export type ClipReply = typeof ClipReplySchema.Type;
