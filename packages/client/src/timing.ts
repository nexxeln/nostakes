import { COMMAND_BURST, FRAME_BURST } from "@nostakes/protocol";

export { PING_INTERVAL_MS } from "@nostakes/protocol";

export const BACKOFF_FIRST_MS = 250;

export const BACKOFF_CAP_MS = 10_000;

export const CONNECT_TIMEOUT_MS = 10_000;

export const GREETING_TIMEOUT_MS = 5000;

export const SILENCE_LIMIT_MS = 30_000;

export const ANSWER_LIMIT_MS = 5000;

export const OVERDUE_GRACE_MS = 1000;

export const REPLY_LAST_RESORT_MS = 20_000;

export const WAKE_PROBE_MS = 2000;

export const CLIENT_FRAME_BURST = FRAME_BURST - 2;

export const CLIENT_BURST_REFILL_MS = 500;

export const CLIENT_COMMAND_BURST = COMMAND_BURST - 2;

export const CLIENT_COMMAND_REFILL_MS = 5000;
