import type { HttpRefusal, PlainRefusal } from "@nostakes/protocol";
import { TooManyRequestsSchema } from "@nostakes/protocol";
import { Schema } from "effect";

const PLAIN_TEXT = {
  BadOrigin:
    "This page can't reach the room server. Open nostakes.club instead.",
  BadRequest: "The server couldn't read that. Check your name and try again.",
  BodyTooLarge: "That's too long to send. Try a shorter name.",
  NoFreeCode: "Couldn't find a free room code. Try again.",
  NotAuthorized:
    "This room doesn't know this device. Open the room link to join.",
  NotFound: "No room has that code.",
  RoomFull: "That room is full.",
  RoomHalted: "That room stopped because of a fault.",
  RoomOpen: "That room is still open.",
  RoomUnavailable: "The room isn't answering yet. Try again in a few seconds.",
  ServerFault: "Something went wrong on the server. Try again.",
  UpgradeRequired:
    "Couldn't open a live connection to the room. Reload the page.",
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
