import { describe, expect, it } from "@effect/vitest";
import {
  ChipsSchema,
  Events,
  PlayerIdSchema,
  SeatIndexSchema,
  Seats,
  TableStates,
} from "@nostakes/engine";
import type { PlayerId } from "@nostakes/engine";
import { Option, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  Actors,
  RoomCodeSchema,
  RoomCommands,
  RoomEvents,
  RoomStates,
  RoomViews,
  attendanceCommand,
  audienceOf,
  decide,
  evolveAll,
  millis,
  nextDeadline,
  openRoom,
  quietDueAt,
  replay,
  viewFor,
} from "../src/index.js";
import type {
  RoomCommand,
  RoomEvent,
  RoomSettings,
  RoomState,
  RoomView,
} from "../src/index.js";
import { serverAnswer } from "./beacon.js";
import { drand } from "./fixtures.js";
import { seededRandom } from "./random.js";
import { POOL, settingsFrom } from "./sessions.js";

const between = (minimum: number, maximum: number) =>
  Schema.Int.check(Schema.isBetween({ maximum, minimum }));

const NightSchema = Schema.Struct({
  grace: between(0, 300),
  playedFirst: between(0, 120),
  players: between(2, 9),
  returner: between(0, 8),
  setup: between(0, 1_000_000_000),
});

const nights = Arbitrary.schema(NightSchema);

const STEP_LIMIT = 5000;

const DAY_MS = 86_400_000;

const host = POOL[0] ?? PlayerIdSchema.make("p0");

const spectator = POOL[9] ?? PlayerIdSchema.make("p9");

const isHandStarted = (event: RoomEvent) =>
  RoomEvents.$is("Table")(event) && Events.$is("HandStarted")(event.event);

const seatedIn = (state: RoomState): readonly PlayerId[] =>
  RoomStates.$is("Open")(state)
    ? state.table.seats.flatMap((seat) =>
        Seats.$is("Occupied")(seat) ? [seat.player] : []
      )
    : [];

const dealable = (state: RoomState) =>
  RoomStates.$is("Open")(state)
    ? state.table.seats.filter(
        (seat) =>
          Seats.$is("Occupied")(seat) && !seat.sittingOut && seat.stack > 0
      ).length
    : 0;

const attendanceOf = (state: RoomState) =>
  RoomStates.$is("Open")(state) ? state.attendance._tag : "Closed";

const shownAttendance = (view: RoomView) =>
  RoomViews.$is("Open")(view) ? view.attendance._tag : "Closed";

const inHand = (state: RoomState) =>
  RoomStates.$is("Open")(state) && TableStates.$is("InHand")(state.table);

const nowOf = (state: RoomState) =>
  RoomStates.$is("Open")(state) ? state.now : millis(0);

const quietBy = (state: RoomState) =>
  RoomStates.$is("Open")(state) ? quietDueAt(state) : Option.none();

const night = (settings: RoomSettings, players: number, setup: number) => {
  const random = seededRandom(setup);

  let state = replay(
    openRoom({
      at: millis(0),
      avatar: "",
      chain: drand.chain,
      code: RoomCodeSchema.make("QWTAB2"),
      host,
      name: "host",
      settings,
    })
  );

  const events: RoomEvent[] = [];
  const refused: string[] = [];

  const run = (command: RoomCommand) => {
    const decision = decide(state, command);

    if (Result.isSuccess(decision)) {
      state = evolveAll(state, decision.success);
      events.push(...decision.success);
    } else {
      refused.push(`${command._tag}: ${decision.failure._tag}`);
    }

    return decision;
  };

  const at = millis(0);

  for (const [index, player] of POOL.slice(0, players).entries()) {
    run(
      RoomCommands.Join({
        at,
        avatar: "",
        by: Actors.Member({ player }),
        name: player,
      })
    );
    run(
      RoomCommands.RequestSeat({
        at,
        buyIn: ChipsSchema.make(settings.buyIn.max),
        by: Actors.Member({ player }),
        seat: SeatIndexSchema.make(index),
      })
    );
  }

  run(
    RoomCommands.Join({
      at,
      avatar: "",
      by: Actors.Member({ player: spectator }),
      name: "watcher",
    })
  );
  run(RoomCommands.StartGame({ at, by: Actors.Member({ player: host }) }));
  refused.length = 0;

  const answerDeadlines = (limit: number, stopWhen: () => boolean) => {
    let steps = 0;

    for (; steps < limit && !stopWhen(); steps += 1) {
      const deadline = nextDeadline(state);

      if (Option.isNone(deadline)) {
        break;
      }

      run(serverAnswer(deadline.value, steps + random.below(1000)));
    }

    return steps;
  };

  const note = (when: number, connected: readonly PlayerId[]) =>
    Option.match(attendanceCommand(state, connected, millis(when)), {
      onNone: () => [],
      onSome: (command) =>
        Result.getOrElse(run(command), (): readonly RoomEvent[] => []),
    });

  return {
    answerDeadlines,
    events,
    note,
    refused,
    state: () => state,
  };
};

const quietSettings = (setup: number, grace: number): RoomSettings => {
  const base = settingsFrom(seededRandom(setup));

  return {
    ...base,
    approval: { chips: false, seats: false },
    dealing: "Automatic",
    pauseWhenAwaySeconds: grace,
    sitOutAfterTimeouts: 0,
    turnSeconds: 1 + (setup % 30),
  };
};

describe("a table nobody is at", () => {
  it.prop(
    "when every seated player disconnects, the hand in play finishes, no hand starts once the pause runs out, and the log stops growing until a seated player is back, when the game goes on by itself",
    { night: nights },
    ({ night: { grace, playedFirst, players, returner, setup } }) => {
      const settings = quietSettings(setup, grace);
      const table = night(settings, players, setup);

      table.answerDeadlines(playedFirst, () => false);

      const leftAt = nowOf(table.state());
      const left = table.note(leftAt, []);
      const quietAt = quietBy(table.state());
      const before = table.events.length;
      const steps = table.answerDeadlines(STEP_LIMIT, () => false);
      const whileAway = table.events.slice(before);

      const lateStarts = whileAway.filter(
        (event) =>
          isHandStarted(event) &&
          Option.exists(quietAt, (due) => event.at >= due)
      ).length;

      const quiet = table.state();
      const later = nowOf(quiet) + DAY_MS;
      const stillAway = table.note(later, [spectator]);
      const heldBy = seatedIn(quiet);
      const back = heldBy[returner % Math.max(1, heldBy.length)];

      const returned = table.note(
        later,
        back === undefined ? [] : [back, spectator]
      );

      const resumedFrom = table.events.length;
      const canDeal = dealable(table.state()) >= 2;

      table.answerDeadlines(STEP_LIMIT, () =>
        table.events.slice(resumedFrom).some(isHandStarted)
      );

      expect({
        attendanceWhileAway: attendanceOf(quiet),
        deadlineWhileAway: Option.isNone(nextDeadline(quiet)),
        handInPlayWhileAway: inHand(quiet),
        lateStarts: lateStarts <= (settings.shuffle === "Checked" ? 1 : 0),
        left: left.map(({ _tag }) => _tag),
        refused: table.refused,
        returned: returned.map(({ _tag }) => _tag),
        stepsFinished: steps < STEP_LIMIT,
        stillAway,
        view: shownAttendance(
          viewFor(quiet, audienceOf(quiet, spectator), millis(later))
        ),
      }).toStrictEqual({
        attendanceWhileAway: "Quiet",
        deadlineWhileAway: true,
        handInPlayWhileAway: false,
        lateStarts: true,
        left: ["TableUnattended"],
        refused: [],
        returned: ["TableAttended"],
        stepsFinished: true,
        stillAway: [],
        view: "Quiet",
      });
      expect(attendanceOf(table.state())).toBe("Attended");
      expect(table.events.slice(resumedFrom).some(isHandStarted)).toBe(canDeal);
    }
  );

  it("a spectator's connection does not keep the game running, and a seated player's does", () => {
    const table = night(quietSettings(7, 0), 2, 7);
    const seated = seatedIn(table.state());

    expect(table.note(10, [spectator]).map(({ _tag }) => _tag)).toStrictEqual([
      "TableUnattended",
    ]);
    expect(
      table
        .note(20, [spectator, ...seated.slice(0, 1)])
        .map(
          (event) =>
            RoomEvents.$is("TableAttended")(event) &&
            `${event.player} ${Option.isNone(event.quietSince)}`
        )
    ).toStrictEqual([`${seated[0]} true`]);
    expect(table.note(30, seated)).toStrictEqual([]);
    expect(attendanceOf(table.state())).toBe("Attended");
  });
});
