import { describe, expect, it } from "@effect/vitest";
import { Actions, ChipsSchema, Events } from "@nostakes/engine";
import type { Action } from "@nostakes/engine";
import { AmountSchema, BoughtIn, CashedOut } from "@nostakes/ledger";

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
