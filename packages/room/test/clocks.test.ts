import { describe, expect, it } from "@effect/vitest";
import { Actions, ChipsSchema, Events, RunCountSchema } from "@nostakes/engine";
import type { Action } from "@nostakes/engine";
import { Option } from "effect";

import {
  ActionNotOnSeat,
  ClockNotDue,
  Deadlines,
  NoSuchDeadline,
  RoomCommands,
  RoomEvents,
  ServerOnly,
  nextDeadline,
  timeBankLeft,
} from "../src/index.js";
import type { RoomEvent, RoomSettings, RoomState } from "../src/index.js";
import {
  ann,
  as,
  bob,
  cat,
  dealAt,
  join,
  ms,
  openOf,
  openedBy,
  rejection,
  run,
  runAll,
  seat,
  server,
  settings,
  sit,
} from "./fixtures.js";

const clocked = {
  ...settings,
  runChoiceSeconds: 10,
  timeBankSeconds: 20,
  turnSeconds: 30,
};

const act = (who: typeof ann, action: Action, at: number) =>
  RoomCommands.Act({ action, at: ms(at), by: as(who) });

const expire = (deadline: number, at = deadline) =>
  RoomCommands.ExpireClock({ at: ms(at), by: server, deadline: ms(deadline) });

const choose = (who: typeof ann, runs: number, at: number) =>
  RoomCommands.ChooseRuns({
    at: ms(at),
    by: as(who),
    runs: RunCountSchema.make(runs),
  });

const dealt = run(
  runAll(openedBy(ann, clocked), [
    join(bob),
    join(cat),
    sit(ann, 0),
    sit(bob, 1),
    sit(cat, 2),
    RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
  ]),
  dealAt(1000)
);

const clockEvents = (events: readonly RoomEvent[]) =>
  events.filter((event) => !RoomEvents.$is("Table")(event));

const deadlineOf = (state: RoomState) => nextDeadline(state);

describe("turn clocks", () => {
  it("starts the clock of the first seat to act when the hand is dealt", () => {
    expect(dealt.events.at(-1)).toStrictEqual(
      RoomEvents.TurnClockStarted({
        at: ms(1000),
        deadline: ms(31_000),
        player: ann,
        seat: seat(0),
      })
    );
    expect(deadlineOf(dealt.state)).toStrictEqual(
      Option.some(Deadlines.TurnClock({ at: ms(31_000), seat: seat(0) }))
    );
  });

  it("refuses an expiry before the deadline, for a deadline that does not exist, or from a member", () => {
    expect(rejection(dealt.state, expire(31_000, 30_999))).toStrictEqual(
      new ClockNotDue({ at: ms(30_999), deadline: ms(31_000) })
    );
    expect(rejection(dealt.state, expire(31_001))).toStrictEqual(
      new NoSuchDeadline({ deadline: ms(31_001) })
    );
    expect(
      rejection(
        dealt.state,
        RoomCommands.ExpireClock({
          at: ms(31_000),
          by: as(bob),
          deadline: ms(31_000),
        })
      )
    ).toStrictEqual(new ServerOnly({ command: "ExpireClock" }));
  });

  it("acts for a seat whose bank runs out, folding when it cannot check, then marks it away and sits it out", () => {
    const facing = runAll(dealt.state, [
      act(ann, Actions.Call(), 2000),
      expire(32_000),
    ]);

    expect(deadlineOf(facing)).toStrictEqual(
      Option.some(Deadlines.TurnClock({ at: ms(52_000), seat: seat(1) }))
    );

    const timedOut = run(facing, expire(52_000, 52_400));

    expect(timedOut.events).toStrictEqual([
      RoomEvents.Table({
        at: ms(52_400),
        event: Events.Folded({ seat: seat(1) }),
      }),
      RoomEvents.Table({
        at: ms(52_400),
        event: Events.SittingOutChanged({ seat: seat(1), sittingOut: true }),
      }),
      RoomEvents.MarkedAway({ at: ms(52_400), seat: seat(1) }),
      RoomEvents.TimeBankSpent({ at: ms(52_400), player: bob, seconds: 20 }),
      RoomEvents.TurnClockStarted({
        at: ms(52_400),
        deadline: ms(82_400),
        player: cat,
        seat: seat(2),
      }),
    ]);
    expect(timeBankLeft(openOf(timedOut.state), bob)).toBe(0);
    expect(openOf(timedOut.state).away).toStrictEqual([seat(1)]);

    const back = run(
      timedOut.state,
      RoomCommands.SitIn({ at: ms(53_000), by: as(bob) })
    );

    expect(openOf(back.state).away).toStrictEqual([]);
  });

  it("checks for a seat that times out when a check is legal", () => {
    const toBigBlind = runAll(dealt.state, [
      act(ann, Actions.Call(), 2000),
      act(bob, Actions.Call(), 3000),
    ]);

    const banked = run(toBigBlind, expire(33_000)).state;
    const timedOut = run(banked, expire(53_000));

    expect(timedOut.events[0]).toStrictEqual(
      RoomEvents.Table({
        at: ms(53_000),
        event: Events.Checked({ seat: seat(2) }),
      })
    );
    expect(openOf(timedOut.state).away).toStrictEqual([seat(2)]);
  });
});

describe("the host acting for a seat", () => {
  it("acts automatically only for the seat the action is on, with or without a clock", () => {
    const quiet = run(
      runAll(openedBy(ann), [
        join(bob),
        join(cat),
        sit(ann, 0),
        sit(bob, 1),
        sit(cat, 2),
        RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
      ]),
      dealAt(10)
    );

    expect(deadlineOf(quiet.state)).toStrictEqual(Option.none());
    expect(
      rejection(
        quiet.state,
        RoomCommands.ActForSeat({ at: ms(11), by: as(ann), player: bob })
      )
    ).toStrictEqual(new ActionNotOnSeat({ player: bob }));
    expect(
      run(
        quiet.state,
        RoomCommands.ActForSeat({ at: ms(11), by: as(ann), player: ann })
      ).events
    ).toStrictEqual([
      RoomEvents.Table({ at: ms(11), event: Events.Folded({ seat: seat(0) }) }),
    ]);
  });
});

const threeRuns = (chosen: RoomSettings): RoomSettings => ({
  ...chosen,
  table: { ...chosen.table, maxRuns: RunCountSchema.make(3) },
});

const allInVote = (chosen: RoomSettings) =>
  run(
    runAll(openedBy(ann, chosen), [
      join(bob),
      sit(ann, 0, 100),
      sit(bob, 1, 100),
      RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
      dealAt(10),
      act(ann, Actions.RaiseTo({ to: ChipsSchema.make(100) }), 20),
    ]),
    act(bob, Actions.Call(), 30)
  );

const runChoices = (events: readonly RoomEvent[]) =>
  events.flatMap((event) =>
    RoomEvents.$is("Table")(event) &&
    (Events.$is("RunsChosen")(event.event) ||
      Events.$is("RunsAgreed")(event.event) ||
      Events.$is("HandEnded")(event.event))
      ? [event.event]
      : []
  );

const changeSettings = (chosen: RoomSettings, at: number) =>
  RoomCommands.ChangeSettings({ at: ms(at), by: as(ann), settings: chosen });

describe("run-choice clock", () => {
  it("shares one deadline among the seats choosing, and chooses one run for each seat still choosing when it expires, which ends the hand", () => {
    const called = allInVote(threeRuns(clocked));

    expect(called.events.at(-1)).toStrictEqual(
      RoomEvents.RunClockStarted({ at: ms(30), deadline: ms(10_030) })
    );

    const oneChose = run(called.state, choose(ann, 3, 40));

    expect(clockEvents(oneChose.events)).toStrictEqual([]);

    const expired = run(oneChose.state, expire(10_030));

    expect(runChoices(expired.events)).toStrictEqual([
      Events.RunsChosen({ runs: RunCountSchema.make(1), seat: seat(1) }),
      Events.RunsAgreed({ runs: RunCountSchema.make(1) }),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(openOf(expired.state).clocks.decision).toStrictEqual(Option.none());
  });

  it("runs the vote clock in a room with no turn clock, and runs the board once for seats that never choose without marking them away", () => {
    const called = allInVote(threeRuns(settings));

    expect(deadlineOf(called.state)).toStrictEqual(
      Option.some(Deadlines.RunChoiceClock({ at: ms(10_030) }))
    );

    const expired = run(called.state, expire(10_030));

    expect(runChoices(expired.events)).toStrictEqual([
      Events.RunsChosen({ runs: RunCountSchema.make(1), seat: seat(0) }),
      Events.RunsAgreed({ runs: RunCountSchema.make(1) }),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(openOf(expired.state).clocks.decision).toStrictEqual(Option.none());
    expect(openOf(expired.state).away).toStrictEqual([]);
  });

  it("keeps the one vote clock while the host turns the turn clock off and on during the vote", () => {
    const unclocked = threeRuns(settings);
    const withTurns = threeRuns(clocked);

    for (const [first, second] of [
      [unclocked, withTurns],
      [withTurns, unclocked],
    ] as const) {
      const called = allInVote(first);
      const changed = run(called.state, changeSettings(second, 40));
      const back = run(changed.state, changeSettings(first, 50));

      expect([...changed.events, ...back.events]).toStrictEqual([
        RoomEvents.SettingsChanged({ at: ms(40), settings: second }),
        RoomEvents.SettingsChanged({ at: ms(50), settings: first }),
      ]);
      expect(deadlineOf(back.state)).toStrictEqual(
        Option.some(Deadlines.RunChoiceClock({ at: ms(10_030) }))
      );
    }
  });
});
