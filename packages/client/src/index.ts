export { backoffWindow, drawBackoff, type BackoffWindow } from "./backoff.js";

export {
  CLOSE_VERDICTS,
  closeReasonIn,
  type CloseVerdict,
} from "./close-reasons.js";

export { BatchFits, fitBatch, fitWelcome, type BatchFit } from "./sequence.js";

export {
  BACKOFF_CAP_MS,
  BACKOFF_FIRST_MS,
  CLIENT_BURST_REFILL_MS,
  CLIENT_FRAME_BURST,
  CONNECT_TIMEOUT_MS,
  GREETING_TIMEOUT_MS,
  PING_INTERVAL_MS,
  SILENCE_LIMIT_MS,
  WAKE_PROBE_MS,
} from "./timing.js";
