import type { PlayerId } from "@nostakes/protocol";
import { Option } from "effect";

import { isYou } from "./room.js";
import type { OpenView } from "./room.js";

export const heirsOf = (
  view: OpenView,
  presence: readonly PlayerId[]
): readonly PlayerId[] => {
  if (!isYou(view, view.host)) {
    return [];
  }

  const members = view.members.map(({ player }) => player);

  const seated = view.seats.flatMap(({ occupant }) =>
    Option.toArray(occupant).map(({ player }) => player)
  );

  const order = [
    ...seated.filter((player) => members.includes(player)),
    ...members,
  ];

  return order.filter(
    (player, place) =>
      order.indexOf(player) === place &&
      player !== view.host &&
      presence.includes(player)
  );
};

export const heirOf = (
  view: OpenView,
  presence: readonly PlayerId[],
  picked: Option.Option<PlayerId>
): Option.Option<PlayerId> => {
  const heirs = heirsOf(view, presence);

  return picked.pipe(
    Option.filter((player) => heirs.includes(player)),
    Option.orElse(() => Option.fromNullishOr(heirs[0]))
  );
};
