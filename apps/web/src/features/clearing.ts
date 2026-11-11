import type { PlayerId } from "@nostakes/protocol";
import { Option } from "effect";

import type { InRoom } from "./model.js";
import { isolated } from "./names.js";
import { nameOf, openViewOf } from "./room.js";
import type { OpenView } from "./room.js";

const listed = (names: readonly string[]) =>
  names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;

const seatedIn = (view: OpenView, player: PlayerId) =>
  view.seats.some(({ occupant }) =>
    Option.exists(occupant, (seated) => seated.player === player)
  );

const leftIn = (view: OpenView, player: PlayerId) =>
  view.departed.some((person) => person.player === player);

const stillHere = (view: OpenView, player: PlayerId) =>
  leftIn(view, player) ||
  view.members.some((person) => person.player === player);

export const clearOutcome = (
  view: OpenView,
  named: readonly PlayerId[]
): Option.Option<string> => {
  const stayed = named.filter((player) => stillHere(view, player));

  if (stayed.length === 0) {
    return Option.none();
  }

  const name = (player: PlayerId) => isolated(nameOf(view, player));
  const seated = stayed.filter((player) => seatedIn(view, player));

  const counted = stayed.filter(
    (player) => !seatedIn(view, player) && leftIn(view, player)
  );

  const others = stayed.filter(
    (player) => !seatedIn(view, player) && !leftIn(view, player)
  );

  const gone = named.length - stayed.length;

  const reasons = [
    ...(seated.length === 0
      ? []
      : [
          `${listed(seated.map(name))} ${seated.length === 1 ? "took a seat" : "took seats"}`,
        ]),
    ...(counted.length === 0
      ? []
      : [
          `${listed(counted.map(name))} ${counted.length === 1 ? "is" : "are"} in the settle-up`,
        ]),
    ...(others.length === 0
      ? []
      : [
          `${listed(others.map(name))} ${others.length === 1 ? "is" : "are"} still here`,
        ]),
  ];

  return Option.some(
    `${gone === 0 ? "Nobody" : gone} removed. ${reasons.join(" and ")}, so they stay.`
  );
};

export const reportedClear = (room: InRoom): InRoom =>
  Option.match(room.clearing, {
    onNone: () => room,
    onSome: ({ named, seq }) => {
      const landed = Option.all({ seen: room.shown, sent: seq }).pipe(
        Option.filter(({ seen, sent }) => seen.seq >= sent)
      );

      if (Option.isNone(landed)) {
        return room;
      }

      return {
        ...room,
        clearing: Option.none(),
        notice: openViewOf(room).pipe(
          Option.flatMap((view) => clearOutcome(view, named)),
          Option.orElse(() => room.notice)
        ),
      };
    },
  });
