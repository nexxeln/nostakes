import { CloseReasonSchema } from "@nostakes/protocol";
import type { CloseReason } from "@nostakes/protocol";
import { Schema } from "effect";
import type { Option } from "effect";

export type CloseVerdict = "Retry" | "Refuse" | "Outdated";

export const CLOSE_VERDICTS: Readonly<Record<CloseReason, CloseVerdict>> = {
  ClientOutdated: "Outdated",
  FrameTooLarge: "Refuse",
  HelloTimeout: "Retry",
  NotAuthorized: "Refuse",
  NotFound: "Refuse",
  ProtocolViolation: "Refuse",
  RoomHalted: "Refuse",
  ServerOutdated: "Retry",
  TooManyFrames: "Retry",
  TooManySockets: "Retry",
  Unresponsive: "Retry",
};

const decodeCloseReason = Schema.decodeUnknownOption(CloseReasonSchema);

export const closeReasonIn = (text: string): Option.Option<CloseReason> =>
  decodeCloseReason(text);
