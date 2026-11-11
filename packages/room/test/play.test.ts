import { describe, expect, it } from "@effect/vitest";
import {
  Actions,
  ChipsSchema,
  Events,
  NotYourTurn,
  RunCountSchema,
  ShownCardsSchema,
  TableStates,
} from "@nostakes/engine";
import type { Action } from "@nostakes/engine";
import { Option } from "effect";

import {
  MembersOnly,
  NotSeated,
  RoomCommands,
  RoomEvents,
  TableRejected,
} from "../src/index.js";
import type { RoomEvent } from "../src/index.js";
import {
  ann,
  as,
  dan as player4,
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

const act = (who: typeof ann, action: Action, at = 4) =>
  RoomCommands.Act({ action, at: ms(at), by: as(who) });

const fold = Actions.Fold();

const call = Actions.Call();

const choose = (who: typeof ann, runs: number) =>
  RoomCommands.ChooseRuns({
    at: ms(5),
    by: as(who),
    runs: RunCountSchema.make(runs),
  });

const tableEvents = (events: readonly RoomEvent[]) =>
  events.flatMap((event) =>
    RoomEvents.$is("Table")(event) ? [event.event._tag] : []
  );

const threeHanded = runAll(
  openedBy(ann, { ...settings, betweenHandsSeconds: 5 }),
  [
    join(bob),
    join(cat),
    sit(ann, 0),
    sit(bob, 1),
    sit(cat, 2),
    RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
    dealAt(3),
  ]
);

describe("play", () => {
  it("acts for the actor's own seat and wraps the engine's refusal for anyone else", () => {
    expect(rejection(threeHanded, act(bob, fold))).toStrictEqual(
      new TableRejected({
        rejection: new NotYourTurn({ seat: seat(1), toAct: seat(0) }),
      })
    );
    expect(
      rejection(runAll(threeHanded, [join(player4)]), act(player4, fold))
    ).toStrictEqual(new NotSeated({ player: player4 }));
    expect(
      rejection(
        threeHanded,
        RoomCommands.Act({ action: Actions.Fold(), at: ms(4), by: server })
      )
    ).toStrictEqual(new MembersOnly({ command: "Act" }));
    expect(run(threeHanded, act(ann, fold)).events).toStrictEqual([
      RoomEvents.Table({ at: ms(4), event: Events.Folded({ seat: seat(0) }) }),
    ]);
  });

  it("lets each all-in seat choose its runs and runs the board out the agreed number of times", () => {
    const allIn = runAll(
      openedBy(ann, {
        ...settings,
        table: { ...settings.table, maxRuns: RunCountSchema.make(2) },
      }),
      [
        join(bob),
        sit(ann, 0, 100),
        sit(bob, 1, 100),
        RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
        dealAt(3),
        act(ann, Actions.RaiseTo({ to: ChipsSchema.make(100) })),
        act(bob, call),
      ]
    );

    const chosen = run(allIn, choose(ann, 2));

    expect(tableEvents(chosen.events)).toStrictEqual(["RunsChosen"]);

    const ran = run(chosen.state, choose(bob, 2));

    expect(tableEvents(ran.events).slice(0, 3)).toStrictEqual([
      "RunsChosen",
      "RunsAgreed",
      "HandsTabled",
    ]);
    expect(tableEvents(ran.events).at(-1)).toBe("HandEnded");
  });

  it("shows a folded hand's cards after the hand on the owner's request", () => {
    const folded = runAll(threeHanded, [act(ann, fold), act(bob, fold)]);
    const { table } = openOf(folded);

    const held = TableStates.$is("BetweenHands")(table)
      ? (Option.getOrThrow(table.lastHand).players.find(
          (player) => player.seat === seat(1)
        )?.holeCards ?? [])
      : [];

    expect(
      run(
        folded,
        RoomCommands.ShowCards({
          at: ms(6),
          by: as(bob),
          cards: ShownCardsSchema.make(held),
        })
      ).events
    ).toStrictEqual([
      RoomEvents.Table({
        at: ms(6),
        event: Events.CardsShown({ cards: held, seat: seat(1) }),
      }),
    ]);
  });
});
