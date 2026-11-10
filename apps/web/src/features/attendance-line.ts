import { AttendanceViewSchema } from "@nostakes/room";
import { Option } from "effect";

import type { InRoom } from "./model.js";
import { openViewOf } from "./room.js";

export const RESUMED_LINE_MS = 15_000;

export const attendanceLine = (
  room: InRoom,
  now: number
): Option.Option<string> =>
  openViewOf(room).pipe(
    Option.flatMap((view) => {
      if (AttendanceViewSchema.guards.Quiet(view.attendance)) {
        return Option.some(
          "The game is paused because nobody at the table is connected. It goes on when one of them is back."
        );
      }

      return room.resumed.pipe(
        Option.filter(
          ({ receivedAt }) =>
            AttendanceViewSchema.guards.Attended(view.attendance) &&
            now - receivedAt < RESUMED_LINE_MS
        ),
        Option.map(({ player }) => {
          const name =
            view.members.find((member) => member.player === player)?.name ??
            "Someone";

          return `The game paused while nobody was at the table. ${name} is back, so it goes on.`;
        })
      );
    })
  );
