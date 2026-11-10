import { CloseReasonSchema } from "@nostakes/protocol";
import type { CloseReason } from "@nostakes/protocol";
import { Schema } from "effect";
import type { Option } from "effect";

export type CloseVerdict = "Retry" | "Refuse";

export const CLOSE_VERDICTS: Readonly<Record<CloseReason, CloseVerdict>> = {
  FrameTooLarge: "Refuse",
  HelloTimeout: "Retry",
  NotAuthorized: "Refuse",
  ProtocolViolation: "Refuse",
  RoomHalted: "Refuse",
  TooManyFrames: "Retry",
};

const decodeCloseReason = Schema.decodeUnknownOption(CloseReasonSchema);

export const closeReasonIn = (text: string): Option.Option<CloseReason> =>
  decodeCloseReason(text);
