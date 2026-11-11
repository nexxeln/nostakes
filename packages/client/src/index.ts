export { backoffWindow, drawBackoff, type BackoffWindow } from "./backoff.js";

export {
  Activities,
  type Activity,
  type ClientContext,
  type ClientInput,
  type DropReason,
  type Link,
  type Owed,
  type PendingCommand,
  type ReceivedSignal,
  type RoomUpdate,
} from "./client-events.js";

export {
  CLOSE_VERDICTS,
  closeReasonIn,
  type CloseVerdict,
} from "./close-reasons.js";

export {
  clientCodec,
  type CatchUp,
  type ClientCodec,
  type ClientMessage,
  type ClientSchemas,
  type ReplyResult,
  type RoomTypes,
  type ServerMessage,
} from "./codec.js";

export {
  answerTimers,
  NOTHING_OWED,
  PING_TIMER,
  pongDeadline,
  replyDeadline,
  roomClientMachine,
  SILENCE_TIMER,
  TIMERS,
  type RoomClientMachine,
} from "./machine.js";

export {
  BatchFits,
  fitBatch,
  fitWelcome,
  WelcomeFits,
  type BatchFit,
  type SkippedRange,
  type WelcomeFit,
  type WelcomeSpan,
} from "./sequence.js";

export { SocketEvents, type SocketEvent } from "./socket-event.js";

export {
  ANSWER_LIMIT_MS,
  BACKOFF_CAP_MS,
  BACKOFF_FIRST_MS,
  CLIENT_BURST_REFILL_MS,
  CLIENT_COMMAND_BURST,
  CLIENT_COMMAND_REFILL_MS,
  CLIENT_FRAME_BURST,
  CONNECT_TIMEOUT_MS,
  GREETING_TIMEOUT_MS,
  OVERDUE_GRACE_MS,
  PING_INTERVAL_MS,
  REPLY_LAST_RESORT_MS,
  SILENCE_LIMIT_MS,
  WAKE_PROBE_MS,
} from "./timing.js";

export { Transport, type Socket } from "./transport.js";

export { webSocketTransport } from "./web-socket-transport.js";

export { ClientRefused } from "./errors/client-refused.js";

export { ClientStopped } from "./errors/client-stopped.js";

export { CommandCancelled } from "./errors/command-cancelled.js";

export { CommandInvalid } from "./errors/command-invalid.js";

export { CommandTooLarge } from "./errors/command-too-large.js";

export { SignalInvalid } from "./errors/signal-invalid.js";

export {
  roomClient,
  type ClientState,
  type CommandFailure,
  type CommandRejectedLocally,
  type ConnectionPhase,
  type IssuedCommand,
  type LocalCancelOutcome,
  type RoomClient,
  type RoomClientOptions,
  type SignalOutcome,
} from "./room-client.js";
