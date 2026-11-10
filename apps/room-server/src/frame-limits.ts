import { MAX_FRAME_BYTES } from "@nostakes/protocol";
import type { CloseReason } from "@nostakes/protocol";
import { Option } from "effect";

const utf8 = new TextEncoder();

export const frameBytes = (raw: string | ArrayBuffer) =>
  raw instanceof ArrayBuffer ? raw.byteLength : utf8.encode(raw).byteLength;

export const oversized = (
  raw: string | ArrayBuffer
): Option.Option<CloseReason> =>
  frameBytes(raw) > MAX_FRAME_BYTES
    ? Option.some("FrameTooLarge")
    : Option.none();
