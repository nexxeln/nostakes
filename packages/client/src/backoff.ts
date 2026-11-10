import { Effect, Random } from "effect";

import { BACKOFF_CAP_MS, BACKOFF_FIRST_MS } from "./timing.js";

export interface BackoffWindow {
  readonly shortestMs: number;
  readonly longestMs: number;
}

const ceilingFor = (attempt: number) =>
  Math.min(BACKOFF_CAP_MS, BACKOFF_FIRST_MS * 2 ** Math.max(0, attempt));

export const backoffWindow = (attempt: number): BackoffWindow => {
  const longestMs = ceilingFor(attempt);

  return { longestMs, shortestMs: longestMs - Math.floor(longestMs / 2) };
};

export const drawBackoff = (attempt: number) => {
  const { longestMs, shortestMs } = backoffWindow(attempt);

  return Random.nextIntBetween(shortestMs, longestMs).pipe(
    Effect.map((delayMs) => Math.min(longestMs, Math.max(shortestMs, delayMs)))
  );
};
