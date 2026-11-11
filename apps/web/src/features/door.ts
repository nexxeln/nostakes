import type { KnockAnswer } from "@nostakes/room";
import { Option } from "effect";

import { KnockAnswers } from "./model.js";
import type { Door, InRoom, DoorAnswer, Model } from "./model.js";

export const KNOCK_PAUSE_MS = 10 * 60 * 1000;

export const DOOR_POLL_MS = 3000;

const MS_PER_MINUTE = 60 * 1000;

export const DOOR_LINES: Readonly<Record<KnockAnswer, string>> = {
  Lapsed: "Nobody came to the door.",
  Locked: "The host locked the room.",
  NameTaken: "Someone here already has that name.",
  NightOver: "The night is over.",
  TurnedAway: "The host didn't let you in.",
  Waiting: "Waiting for the host to let you in",
};

export const doorOf = (answer: KnockAnswer): Door => {
  if (answer === "Waiting") {
    return "Knocking";
  }

  return answer === "TurnedAway" ? "TurnedAway" : "NotLetIn";
};

export const answerOf = (door: DoorAnswer): Option.Option<KnockAnswer> =>
  KnockAnswers.guards.Shown(door)
    ? Option.some(door.knock.answer)
    : Option.none();

export const stillWaiting = (room: InRoom) =>
  Option.exists(room.door, (door) =>
    Option.match(answerOf(door), {
      onNone: () => !KnockAnswers.guards.Asking(door),
      onSome: (answer) => answer === "Waiting",
    })
  );

export const knocksAgain = (answer: KnockAnswer) =>
  answer === "Lapsed" || answer === "NameTaken";

export const pausedUntil = (model: Model, code: string) =>
  Option.fromUndefinedOr(
    model.rooms.find(({ record }) => record.code === code)
  ).pipe(
    Option.filter(({ record }) => record.door === "TurnedAway"),
    Option.map(({ record }) => record.seenAt + KNOCK_PAUSE_MS)
  );

export const pauseText = (remainingMs: number) => {
  const minutes = Math.max(1, Math.ceil(remainingMs / MS_PER_MINUTE));

  return `The host didn't let you in. You can knock again in ${minutes} min.`;
};

export const NAME_TAKEN_PROBLEM =
  "Someone here already has that name. Pick another one and knock again.";
