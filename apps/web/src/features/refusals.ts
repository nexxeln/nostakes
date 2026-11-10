import type { HttpRefusal, PlainRefusal } from "@nostakes/protocol";
import { TooManyRequestsSchema } from "@nostakes/protocol";
import { Schema } from "effect";

const PLAIN_TEXT = {
  BadOrigin: "The room server does not accept this page's address.",
  BadRequest: "The server could not read that. Check the name.",
  NoFreeCode: "No free room code right now. Try again.",
  NotAuthorized: "The room does not know this device's pass.",
  NotFound: "No room has that code.",
  RoomFull: "That room is full.",
  RoomHalted: "That room has stopped.",
  RoomOpen: "That room is still open.",
  RoomUnavailable: "The room is not answering yet. Try again in a few seconds.",
  ServerFault: "The room server hit a fault. Try again.",
  UpgradeRequired: "The room server wanted a live connection.",
} satisfies Record<PlainRefusal["refusal"], string>;

const SECONDS_PER_MINUTE = 60;

const waitText = (seconds: number) => {
  if (seconds > 0 && seconds % SECONDS_PER_MINUTE === 0) {
    const minutes = seconds / SECONDS_PER_MINUTE;

    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
};

const isTooManyRequests = Schema.is(TooManyRequestsSchema);

export const refusalText = (refusal: HttpRefusal) =>
  isTooManyRequests(refusal)
    ? `Too many tries from this network. Try again in ${waitText(refusal.retryAfterSeconds)}.`
    : PLAIN_TEXT[refusal.refusal];
