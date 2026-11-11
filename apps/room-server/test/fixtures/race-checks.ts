import type { PlayerId } from "@nostakes/protocol";
import { RoomEvents, RoomStates, clearable, replay } from "@nostakes/room";
import type { RoomEvent } from "@nostakes/room";
import { Option } from "effect";

const indexOf = (
  events: readonly RoomEvent[],
  found: (event: RoomEvent, index: number) => boolean
) => events.findIndex(found);

const clearableAt = (
  events: readonly RoomEvent[],
  at: number,
  player: PlayerId
) => {
  const [opened, ...rest] = events.slice(0, at);

  if (opened === undefined || !RoomEvents.$is("RoomOpened")(opened)) {
    return false;
  }

  const before = replay([opened, ...rest]);

  return (
    RoomStates.$is("Open")(before) &&
    clearable(before, before.host).includes(player)
  );
};

export const raceProblems = (
  racer: PlayerId,
  stranger: PlayerId,
  events: readonly RoomEvent[]
): readonly string[] => {
  const cleared = indexOf(
    events,
    (event) =>
      RoomEvents.$is("MemberRemoved")(event) && event.player === stranger
  );

  const left = indexOf(
    events,
    (event, index) =>
      index < cleared &&
      RoomEvents.$is("MemberLeft")(event) &&
      event.player === racer
  );

  const back = indexOf(
    events,
    (event, index) =>
      index > left &&
      index < cleared &&
      RoomEvents.$is("MemberJoined")(event) &&
      event.player === racer
  );

  const cameBack = indexOf(
    events,
    (event, index) =>
      index > left &&
      RoomEvents.$is("MemberJoined")(event) &&
      event.player === racer
  );

  const removed = events.filter(
    (event) => RoomEvents.$is("MemberRemoved")(event) && event.player === racer
  );

  const locked = events.findIndex(
    (event, index) =>
      index > cleared &&
      !RoomEvents.$is("MemberRemoved")(event) &&
      !RoomEvents.$is("CashedOut")(event) &&
      !RoomEvents.$is("LeaveQueued")(event) &&
      !RoomEvents.$is("Table")(event)
  );

  const lockedHere = Option.exists(
    Option.fromUndefinedOr(events[locked]),
    (event) => RoomEvents.$is("SettingsChanged")(event) && event.settings.locked
  );

  if (cleared === -1) {
    return [
      "the night planned a rejoin racing the clear, and the stranger was never removed",
    ];
  }

  return [
    ...(left !== -1 && back !== -1 && clearableAt(events, cleared, racer)
      ? []
      : [
          `the racer did not leave and come back before the clear at ${cleared + 1}, clearable then (left at ${left + 1}, back at ${cameBack + 1}; after leaving: ${events
            .flatMap((event, index) =>
              index > left && "player" in event && event.player === racer
                ? [`${index + 1} ${event._tag}`]
                : []
            )
            .join(", ")})`,
        ]),
    ...(lockedHere
      ? []
      : [
          `the host held a clear for the race, and the stranger was removed at ${cleared + 1} without the clear's lock in the same batch`,
        ]),
    ...removed.map(
      () =>
        `the clear removed the racer, who came back after the host's view and was never named`
    ),
  ];
};
