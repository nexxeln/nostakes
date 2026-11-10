import { FRAME_BURST } from "@nostakes/protocol";

export const BACKOFF_FIRST_MS = 250;

export const BACKOFF_CAP_MS = 10_000;

export const CONNECT_TIMEOUT_MS = 10_000;

export const GREETING_TIMEOUT_MS = 5000;

export const PING_INTERVAL_MS = 15_000;

export const SILENCE_LIMIT_MS = 30_000;

export const WAKE_PROBE_MS = 2000;

export const CLIENT_FRAME_BURST = FRAME_BURST - 2;

export const CLIENT_BURST_REFILL_MS = 500;
