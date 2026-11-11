import { Option } from "effect";

import {
  FRAME_BURST,
  FRAMES_PER_SECOND,
  ROOM_STALL_TOLERANCE_MS,
  SIGNAL_BURST,
  SIGNALS_PER_SECOND,
} from "./limits.js";

const MILLI = 1000;

export interface Allowance {
  readonly burst: number;
  readonly perSecond: number;
}

export const FRAME_ALLOWANCE: Allowance = {
  burst: FRAME_BURST + (FRAMES_PER_SECOND * ROOM_STALL_TOLERANCE_MS) / MILLI,
  perSecond: FRAMES_PER_SECOND,
};

export const SIGNAL_ALLOWANCE: Allowance = {
  burst: SIGNAL_BURST,
  perSecond: SIGNALS_PER_SECOND,
};

export interface Bucket {
  readonly milliTokens: number;
  readonly at: number;
}

export const fullBucket = (allowance: Allowance, at: number): Bucket => ({
  at,
  milliTokens: allowance.burst * MILLI,
});

export const spendToken = (
  allowance: Allowance,
  bucket: Bucket,
  at: number
): Option.Option<Bucket> => {
  const refilled = Math.min(
    allowance.burst * MILLI,
    bucket.milliTokens + Math.max(0, at - bucket.at) * allowance.perSecond
  );

  return refilled >= MILLI
    ? Option.some({ at, milliTokens: refilled - MILLI })
    : Option.none();
};
