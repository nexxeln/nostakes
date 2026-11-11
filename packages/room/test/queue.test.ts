import { describe, expect, it } from "@effect/vitest";
import { Actions, ChipsSchema, Events } from "@nostakes/engine";
import type { Action } from "@nostakes/engine";
import { AmountSchema, BoughtIn, CashedOut } from "@nostakes/ledger";
import { Option } from "effect";

import { AlreadyLeaving, RoomCommands, RoomEvents } from "../src/index.js";
import type { RoomEvent } from "../src/index.js";
import {
  ann,
  as,
  bob,
  cat,
  dan,
  dealAt,
  join,
  ms,
  openOf,
  openedBy,
  rejection,
  run,
  runAll,
  seat,
  settings,
  sit,
} from "./fixtures.js";

const act = (who: typeof ann, action: Action, at = 20) =>
  RoomCommands.Act({ action, at: ms(at), by: as(who) });

const amount = (count: number) => AmountSchema.make(count);

const tags = (events: readonly RoomEvent[]) =>
  events.map((event) =>
    RoomEvents.$is("Table")(event) ? event.event._tag : event._tag
  );

const midHand = runAll(openedBy(ann), [
  join(bob),
  join(cat),
  join(dan),
  sit(ann, 0),
  sit(bob, 1),
  sit(cat, 2),
  RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
  dealAt(10),
]);

describe("chips during a hand", () => {
  it("queues chips for a seat dealt in and records the buy-in only when they arrive after the hand", () => {
    const asked = run(
      midHand,
      RoomCommands.RequestChips({
        amount: ChipsSchema.make(100),
        at: ms(15),
        by: as(bob),
      })
    );

    expect(asked.events).toStrictEqual([
      RoomEvents.ChipsQueued({
        amount: ChipsSchema.make(100),
        at: ms(15),
        player: bob,
      }),
    ]);
    expect(openOf(asked.state).entries.get(bob)).toStrictEqual([
      BoughtIn({ amount: amount(200), player: bob }),
    ]);

    const ended = run(
      run(asked.state, act(ann, Actions.Fold())).state,
      act(bob, Actions.Fold())
    );

    expect(tags(ended.events)).toStrictEqual([
      "Folded",
      "UncalledBetReturned",
      "PotAwarded",
      "HandEnded",
      "BoughtIn",
    ]);
    expect(ended.events.at(-1)).toStrictEqual(
      RoomEvents.BoughtIn({
        amount: ChipsSchema.make(100),
        at: ms(20),
        player: bob,
        seat: seat(1),
      })
    );
    expect(openOf(ended.state).queued.chips).toStrictEqual([]);
  });
});

describe("leaving during a hand", () => {
  it("folds a leaving seat when the action reaches it and cashes it out when the hand ends", () => {
    const leaving = run(
      midHand,
      RoomCommands.LeaveSeat({ at: ms(15), by: as(ann) })
    );

    expect(leaving.events).toStrictEqual([
      RoomEvents.LeaveQueued({ at: ms(15), player: ann }),
      RoomEvents.Table({ at: ms(15), event: Events.Folded({ seat: seat(0) }) }),
    ]);
    expect(
      rejection(
        leaving.state,
        RoomCommands.LeaveSeat({ at: ms(16), by: as(ann) })
      )
    ).toStrictEqual(new AlreadyLeaving({ player: ann }));

    const ended = run(leaving.state, act(bob, Actions.Fold()));

    expect(ended.events.at(-1)).toStrictEqual(
      RoomEvents.CashedOut({
        amount: ChipsSchema.make(200),
        at: ms(20),
        player: ann,
        seat: seat(0),
      })
    );
    expect(openOf(ended.state).entries.get(ann)).toStrictEqual([
      BoughtIn({ amount: amount(200), player: ann }),
      CashedOut({ amount: amount(200), player: ann }),
    ]);
  });

  it("checks for a leaving big blind when it can, and keeps the member gone from the room", () => {
    const left = run(
      midHand,
      RoomCommands.LeaveRoom({ at: ms(15), by: as(cat) })
    );

    expect(left.events).toStrictEqual([
      RoomEvents.LeaveQueued({ at: ms(15), player: cat }),
      RoomEvents.MemberLeft({ at: ms(15), player: cat }),
    ]);

    const limped = run(
      run(left.state, act(ann, Actions.Call())).state,
      act(bob, Actions.Call())
    );

    expect(tags(limped.events).slice(0, 3)).toStrictEqual([
      "Called",
      "Checked",
      "StreetDealt",
    ]);
    expect(
      openOf(limped.state).members.map((member) => member.player)
    ).toStrictEqual([ann, bob, dan]);
  });

  it("lets a seat that leaves play the hand out when the room says so, and cashes it out when the hand ends", () => {
    const playsOn = runAll(
      openedBy(ann, { ...settings, leavingMidHand: "PlaysOn" }),
      [
        join(bob),
        join(cat),
        sit(ann, 0),
        sit(bob, 1),
        sit(cat, 2),
        RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
        dealAt(10),
      ]
    );

    const leaving = run(
      playsOn,
      RoomCommands.LeaveSeat({ at: ms(15), by: as(ann) })
    );

    expect(leaving.events).toStrictEqual([
      RoomEvents.LeaveQueued({ at: ms(15), player: ann }),
    ]);

    const raised = run(
      leaving.state,
      act(ann, Actions.RaiseTo({ to: ChipsSchema.make(40) }))
    );

    expect(tags(raised.events)).toStrictEqual(["RaisedTo"]);

    const ended = runAll(raised.state, [
      act(bob, Actions.Fold(), 21),
      act(cat, Actions.Fold(), 22),
    ]);

    expect(openOf(ended).entries.get(ann)).toStrictEqual([
      BoughtIn({ amount: amount(200), player: ann }),
      CashedOut({ amount: amount(215), player: ann }),
    ]);
  });

  it("still acts for a seat whose player left the room when the room lets leavers play on", () => {
    const playsOn = runAll(
      openedBy(ann, { ...settings, leavingMidHand: "PlaysOn" }),
      [
        join(bob),
        join(cat),
        sit(ann, 0),
        sit(bob, 1),
        sit(cat, 2),
        RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
        dealAt(10),
      ]
    );

    const left = run(
      playsOn,
      RoomCommands.LeaveRoom({ at: ms(15), by: as(bob) })
    );

    const reached = run(left.state, act(ann, Actions.Call()));

    expect(tags(reached.events).slice(0, 2)).toStrictEqual([
      "Called",
      "Folded",
    ]);
  });

  it("stands a seat that is not dealt in at once, even during a hand", () => {
    const joined = runAll(midHand, [sit(dan, 5, 200, 12)]);

    expect(
      run(joined, RoomCommands.LeaveSeat({ at: ms(15), by: as(dan) })).events
    ).toStrictEqual([
      RoomEvents.CashedOut({
        amount: ChipsSchema.make(200),
        at: ms(15),
        player: dan,
        seat: seat(5),
      }),
    ]);
  });
});

const raised = {
  ...settings,
  buyIn: { max: ChipsSchema.make(2000), min: ChipsSchema.make(100) },
  table: {
    ...settings.table,
    bigBlind: ChipsSchema.make(20),
    smallBlind: ChipsSchema.make(10),
  },
};

describe("rules changes", () => {
  it("applies everything but the table rules at once, and the table rules when the hand ends", () => {
    const changed = run(
      midHand,
      RoomCommands.ChangeSettings({ at: ms(15), by: as(ann), settings: raised })
    );

    expect(changed.events).toStrictEqual([
      RoomEvents.SettingsChanged({
        at: ms(15),
        settings: { ...raised, table: settings.table },
      }),
      RoomEvents.RulesQueued({ at: ms(15), config: raised.table }),
    ]);
    expect(openOf(changed.state).settings.buyIn.max).toBe(2000);

    const ended = run(
      run(changed.state, act(ann, Actions.Fold())).state,
      act(bob, Actions.Fold())
    );

    expect(ended.events.at(-1)).toStrictEqual(
      RoomEvents.Table({
        at: ms(20),
        event: Events.RulesChanged({ config: raised.table }),
      })
    );
    expect(openOf(ended.state).settings).toStrictEqual(raised);
    expect(openOf(ended.state).table.config).toStrictEqual(raised.table);
  });

  it("keeps a queued table change when the host later sends the queued table with another setting, and drops it when they send the table in play", () => {
    const changed = run(
      midHand,
      RoomCommands.ChangeSettings({ at: ms(15), by: as(ann), settings: raised })
    ).state;

    const locking = (table: typeof settings.table) =>
      openOf(
        run(
          changed,
          RoomCommands.ChangeSettings({
            at: ms(16),
            by: as(ann),
            settings: { ...openOf(changed).settings, locked: true, table },
          })
        ).state
      ).queued.rules;

    expect([locking(raised.table), locking(settings.table)]).toStrictEqual([
      Option.some(raised.table),
      Option.some(settings.table),
    ]);
  });

  it("changes the table rules at once between hands", () => {
    const between = runAll(openedBy(ann), [join(bob)]);

    expect(
      run(
        between,
        RoomCommands.ChangeSettings({
          at: ms(5),
          by: as(ann),
          settings: raised,
        })
      ).events
    ).toStrictEqual([
      RoomEvents.Table({
        at: ms(5),
        event: Events.RulesChanged({ config: raised.table }),
      }),
      RoomEvents.SettingsChanged({ at: ms(5), settings: raised }),
    ]);
  });
});
