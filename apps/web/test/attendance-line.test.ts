import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import {
  AttendanceViewSchema,
  RoomViewSchema,
  SeenEventSchema,
  millis,
} from "@nostakes/room";
import { Option } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  attendanceLine,
  RESUMED_LINE_MS,
} from "../src/features/attendance-line.js";
import { Messages } from "../src/features/message.js";
import type { Message } from "../src/features/message.js";
import type { Model } from "../src/features/model.js";
import { roomOf } from "../src/features/room.js";
import { init, update } from "../src/features/update.js";

const CODE = RoomCodeSchema.make("ABC234");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const BEN = PlayerIdSchema.make("player-0000000be");

type OpenView = typeof RoomViewSchema.cases.Open.Type;

const tables = Arbitrary.schema(RoomViewSchema.cases.Open);

const Attendance = AttendanceViewSchema.cases;

const opened = init({
  invite: Option.some(CODE),
  learned: [],
  profile: { avatar: "🦊", name: "Ana" },
  reloadedFor: Option.none(),
  rooms: [],
  saved: Option.some({ code: CODE, player: PLAYER }),
  sound: false,
  theme: Option.none(),
}).model;

const withBen = (table: OpenView, attendance: OpenView["attendance"]) => ({
  ...table,
  attendance,
  members: [
    ...table.members.filter(({ player }) => player !== BEN),
    { avatar: "owl", name: "Ben", player: BEN },
  ],
});

const benBack = (quietSince: Option.Option<number>) =>
  SeenEventSchema.cases.TableAttended.make({
    at: millis(5000),
    player: BEN,
    quietSince: quietSince.pipe(Option.map(millis)),
  });

const lineAfter = (messages: readonly Message[], now: number) => {
  let model: Model = opened;

  for (const message of messages) {
    ({ model } = update(model, message));
  }

  return roomOf(model).pipe(
    Option.flatMap((room) => attendanceLine(room, now)),
    Option.getOrElse(() => "none")
  );
};

const shown = (
  view: OpenView,
  events: readonly ReturnType<typeof benBack>[],
  receivedAt: number
) =>
  Messages.GotUpdate({
    events: events.map((event, index) => ({ event, seq: index + 2 })),
    receivedAt,
    seq: events.length + 1,
    view,
  });

describe("the line about a table nobody was at", () => {
  it.prop(
    "says why the game is paused while it is quiet, names who brought it back for a while after, and says nothing about a return that ended no pause",
    { table: tables },
    ({ table }) => {
      const quiet = withBen(
        table,
        Attendance.Quiet.make({ pausedAt: millis(1000), since: millis(0) })
      );

      const attended = withBen(
        table,
        Attendance.Attended.make({ since: millis(5000) })
      );

      expect([
        lineAfter([shown(quiet, [], 1000)], 1000),
        lineAfter(
          [
            shown(quiet, [], 1000),
            shown(attended, [benBack(Option.some(1000))], 5000),
          ],
          5000 + RESUMED_LINE_MS - 1
        ),
        lineAfter(
          [shown(attended, [benBack(Option.some(1000))], 5000)],
          5000 + RESUMED_LINE_MS
        ),
        lineAfter([shown(attended, [benBack(Option.none())], 5000)], 5000),
      ]).toStrictEqual([
        "The game is paused because nobody at the table is connected. It goes on when one of them is back.",
        "The game paused while nobody was at the table. Ben is back, so it goes on.",
        "none",
        "none",
      ]);
    }
  );
});
