import {
  FRAME_BURST,
  FRAMES_PER_SECOND,
  MAX_FRAME_BYTES,
} from "@nostakes/protocol";
import type { CloseReason } from "@nostakes/protocol";
import { Option } from "effect";

const MILLI = 1000;

export interface FrameBucket {
  readonly milliFrames: number;
  readonly at: number;
}

export const fullBucket = (at: number): FrameBucket => ({
  at,
  milliFrames: FRAME_BURST * MILLI,
});

export const spendFrame = (
  bucket: FrameBucket,
  at: number
): Option.Option<FrameBucket> => {
  const refilled = Math.min(
    FRAME_BURST * MILLI,
    bucket.milliFrames + Math.max(0, at - bucket.at) * FRAMES_PER_SECOND
  );

  return refilled >= MILLI
    ? Option.some({ at, milliFrames: refilled - MILLI })
    : Option.none();
};

const utf8 = new TextEncoder();

export const frameBytes = (raw: string | ArrayBuffer) =>
  raw instanceof ArrayBuffer ? raw.byteLength : utf8.encode(raw).byteLength;

export const oversized = (
  raw: string | ArrayBuffer
): Option.Option<CloseReason> =>
  frameBytes(raw) > MAX_FRAME_BYTES
    ? Option.some("FrameTooLarge")
    : Option.none();
