import { describe, expect, it } from "@effect/vitest";
import {
  Actions,
  BombPots,
  BombPotsOff,
  Events,
  TableConfigSchema,
  bombPotBoards,
  bombPotDue,
} from "@nostakes/engine";
import type { Action, Event, Game } from "@nostakes/engine";
import { Effect, Option } from "effect";
import type { Types } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  Audiences,
  NotTheHost,
  RoomCommands,
  RoomEvents,
  RoomStates,
  RoomViews,
  TableRejected,
  nextDeadline,
  viewFor,
} from "../src/index.js";
import type { RoomEvent, RoomSettings, RoomState } from "../src/index.js";
import { dealFromBeacon, sealAt, serverAnswer } from "./beacon.js";
import {
  ann,
  as,
  bob,
  cat,
  chipCount,
  dealAt,
  join,
  ms,
  openOf,
  openedBy,
  rejection,
  run,
  runAll,
  settings,
  sit,
} from "./fixtures.js";
import { generated, sized } from "./scale.js";
import { playSession, session } from "./sessions.js";

const ANTE = 20;

const withBombPots = (
  everyHands: number,
  base = settings,
  boards: 1 | 2 = 1
): RoomSettings => ({
  ...base,
  table: TableConfigSchema.make({
    ...base.table,
    bombPot: BombPots.BombPots({
      ante: chipCount(ANTE),
      boardCount: boards,
      everyHands,
    }),
  }),
});

const act = (who: typeof ann, action: Action, at: number) =>
  RoomCommands.Act({ action, at: ms(at), by: as(who) });

const call = (on: boolean, at: number, who = ann) =>
  RoomCommands.CallBombPot({ at: ms(at), by: as(who), on });

const seated = (chosen: RoomSettings, at = 3) =>
  runAll(openedBy(ann, chosen), [
    join(bob),
    join(cat),
    sit(ann, 0),
    sit(bob, 1),
    sit(cat, 2),
    RoomCommands.StartGame({ at: ms(at), by: as(ann) }),
  ]);

const tags = (events: readonly RoomEvent[]) =>
  events.map((event) =>
    RoomEvents.$is("Table")(event) ? event.event._tag : event._tag
  );

const startedIn = (events: readonly RoomEvent[]) =>
  events.flatMap((event) =>
    RoomEvents.$is("Table")(event) && Events.$is("HandStarted")(event.event)
      ? [event.event]
      : []
  )[0];

const bombView = (state: RoomState, at: number) => {
  const view = viewFor(state, Audiences.Unseated({ player: cat }), ms(at));

  return RoomViews.$is("Open")(view)
    ? {
        ...view.bombPot,
        hand: Option.getOrUndefined(
          view.hand.pipe(Option.map((hand) => hand.bombPot))
        ),
      }
    : undefined;
};

const answer = (state: RoomState, seed: number) =>
  run(
    state,
    serverAnswer(Option.getOrThrow(nextDeadline(openOf(state))), seed)
  );

const holeCardCounts = (events: readonly RoomEvent[]) =>
  events.flatMap((event) =>
    RoomEvents.$is("Table")(event) && Events.$is("HoleCardsDealt")(event.event)
      ? [event.event.cards.length]
      : []
  );

describe("changing the game", () => {
  it("leaves a hand already sealed as hold'em with two cards a seat, and deals the hand after it as Omaha with four", () => {
    const omaha: RoomSettings = {
      ...checked,
      table: TableConfigSchema.make({ ...checked.table, game: "Omaha" }),
    };

    const sealed = runAll(seated(checked, START), [
      sealAt(START, 1),
      RoomCommands.ChangeSettings({
        at: ms(START + 100),
        by: as(ann),
        settings: omaha,
      }),
    ]);

    const dealt = run(sealed, dealFromBeacon(ROUND_DUE, SEALED_ROUND));

    expect(startedIn(dealt.events)?.game).toBeUndefined();
    expect(holeCardCounts(dealt.events)).toStrictEqual([2, 2, 2]);

    const ended = runAll(dealt.state, [
      act(ann, Actions.Fold(), ROUND_DUE + 100),
      act(bob, Actions.Fold(), ROUND_DUE + 200),
    ]);

    const resealed = answer(ended, 7);
    const next = answer(resealed.state, 8);

    expect(tags(resealed.events)).toStrictEqual(["HandSealed"]);
    expect(startedIn(next.events)?.game).toBe("Omaha");
    expect(holeCardCounts(next.events)).toStrictEqual([4, 4, 4]);
  });
});

describe("calling a bomb pot", () => {
  it("makes the next hand one: every seat antes, the flop is out, the table's view says so, and the call is spent", () => {
    const called = run(seated(withBombPots(0)), call(true, 5));

    expect(called.events).toStrictEqual([
      RoomEvents.BombPotCalled({ at: ms(5), on: true }),
    ]);
    expect(bombView(called.state, 6)).toStrictEqual({
      called: true,
      hand: undefined,
      next: true,
    });

    const dealt = run(called.state, dealAt(10));

    expect(tags(dealt.events)).toStrictEqual([
      "HandStarted",
      "AntePosted",
      "AntePosted",
      "AntePosted",
      "HoleCardsDealt",
      "HoleCardsDealt",
      "HoleCardsDealt",
      "StreetDealt",
    ]);
    expect(startedIn(dealt.events)?.bombPot).toStrictEqual({
      ante: chipCount(ANTE),
      bigBlind: chipCount(10),
    });
    expect(bombView(dealt.state, 11)).toStrictEqual({
      called: false,
      hand: true,
      next: false,
    });

    const ended = runAll(dealt.state, [
      act(bob, Actions.RaiseTo({ to: chipCount(10) }), 12),
      act(cat, Actions.Fold(), 13),
      act(ann, Actions.Fold(), 14),
    ]);

    expect(startedIn(run(ended, dealAt(20)).events)?.bombPot).toBeUndefined();
  });

  it("is the host's to make and to take back, and only while the rules have bomb pots", () => {
    const table = seated(withBombPots(0));
    const called = run(table, call(true, 5)).state;

    expect(rejection(table, call(true, 5, bob))).toStrictEqual(
      new NotTheHost({ host: ann, player: bob })
    );
    expect(rejection(seated(settings), call(true, 5))).toStrictEqual(
      new TableRejected({ rejection: new BombPotsOff({ handNumber: 1 }) })
    );
    expect(run(called, call(true, 6)).events).toStrictEqual([]);
    expect(run(called, call(false, 6)).events).toStrictEqual([
      RoomEvents.BombPotCalled({ at: ms(6), on: false }),
    ]);
    expect(
      startedIn(run(run(called, call(false, 6)).state, dealAt(10)).events)
        ?.bombPot
    ).toBeUndefined();
  });

  it("is dropped when the host turns bomb pots off", () => {
    const called = run(seated(withBombPots(0)), call(true, 5)).state;

    const off = run(
      called,
      RoomCommands.ChangeSettings({ at: ms(6), by: as(ann), settings })
    ).state;

    expect(openOf(off).bombCalled).toBe(false);
    expect(startedIn(run(off, dealAt(10)).events)?.bombPot).toBeUndefined();
  });
});

const START = 10_000;

const SEALED_ROUND = 6;

const ROUND_DUE = 15_000;

const checked = withBombPots(0, {
  ...settings,
  betweenHandsSeconds: 5,
  shuffle: "Checked",
});

describe("a bomb pot and the seal", () => {
  it("seals a called hand as a bomb pot, and taking the call back afterwards does not change that hand", () => {
    const sealed = runAll(seated(checked, START), [
      call(true, START),
      sealAt(START, 1),
      call(false, START + 100),
    ]);

    expect(bombView(sealed, START + 200)).toStrictEqual({
      called: false,
      hand: undefined,
      next: true,
    });
    expect(
      startedIn(run(sealed, dealFromBeacon(ROUND_DUE, SEALED_ROUND)).events)
        ?.bombPot
    ).toBeDefined();
  });

  it("leaves a hand that is already sealed as it was, and makes the hand after it the bomb pot", () => {
    const sealed = runAll(seated(checked, START), [
      sealAt(START, 1),
      call(true, START + 100),
    ]);

    expect(bombView(sealed, START + 200)).toStrictEqual({
      called: true,
      hand: undefined,
      next: false,
    });

    const dealt = run(sealed, dealFromBeacon(ROUND_DUE, SEALED_ROUND));

    expect(startedIn(dealt.events)?.bombPot).toBeUndefined();
    expect(tags(dealt.events)).toContain("BlindPosted");

    const ended = runAll(dealt.state, [
      act(ann, Actions.Fold(), ROUND_DUE + 100),
      act(bob, Actions.Fold(), ROUND_DUE + 200),
    ]);

    expect(openOf(ended).bombCalled).toBe(true);

    const resealed = answer(ended, 7);

    expect(tags(resealed.events)).toStrictEqual(["HandSealed"]);
    expect(bombView(resealed.state, ROUND_DUE + 300)?.next).toBe(true);
    expect(startedIn(answer(resealed.state, 8).events)?.bombPot).toBeDefined();
  });
});

type Source = typeof session extends Arbitrary.Arbitrary<infer A> ? A : never;

const dueAt = (state: RoomState, calledAtSeal: Option.Option<boolean>) =>
  RoomStates.$match(state, {
    Closed: () => false,
    Open: (open) =>
      bombPotDue(
        open.table,
        Option.getOrElse(
          calledAtSeal,
          () =>
            open.bombCalled &&
            BombPots.$is("BombPots")(open.table.config.bombPot)
        )
      ),
  });

const boardsAt = (state: RoomState, bomb: boolean) =>
  RoomStates.$match(state, {
    Closed: () => 1,
    Open: (open) => (bomb ? bombPotBoards(open.table.config) : 1),
  });

const boardProblems = (
  started: Types.ExtractTag<Event, "HandStarted">,
  boards: number
) => {
  const dealt = started.bombPot?.boardCount ?? 1;

  return dealt === boards
    ? []
    : [
        `hand ${started.handNumber} dealt ${dealt} boards, the rules said ${boards}`,
      ];
};

const gameAt = (state: RoomState): Game =>
  RoomStates.$match(state, {
    Closed: (): Game => "Holdem",
    Open: (open) => open.table.config.game,
  });

const gameProblems = (
  started: Types.ExtractTag<Event, "HandStarted">,
  expected: Game
) => {
  const dealt = started.game ?? "Holdem";

  return dealt === expected
    ? []
    : [
        `hand ${started.handNumber} was dealt as ${dealt}, the rules said ${expected}`,
      ];
};

const anyRoom = (chosen: RoomSettings) => chosen;

const checkedRoom = (chosen: RoomSettings): RoomSettings => ({
  ...chosen,
  shuffle: "Checked",
});

const kindProblems = (source: Source, room = anyRoom) => {
  const problems: string[] = [];
  const sealedAs = new Map<number, boolean>();
  const sealedBoards = new Map<number, number>();
  const sealedGames = new Map<number, Game>();
  let previous: RoomState | undefined;
  let bombPots = 0;
  let sealedBombPots = 0;
  let doubleBoards = 0;
  playSession(
    source,
    (state, event) => {
      const before = previous ?? state;

      if (RoomEvents.$is("HandSealed")(event)) {
        const due = dueAt(before, Option.none());

        sealedAs.set(event.hand, due);
        sealedBoards.set(event.hand, boardsAt(before, due));
        sealedGames.set(event.hand, gameAt(before));
      }

      if (RoomEvents.$is("SealWithdrawn")(event)) {
        sealedAs.delete(event.hand);
        sealedBoards.delete(event.hand);
        sealedGames.delete(event.hand);
      }

      if (
        RoomEvents.$is("Table")(event) &&
        Events.$is("HandStarted")(event.event)
      ) {
        const started = event.event;
        const sealed = sealedAs.get(started.handNumber);
        const expected = sealed ?? dueAt(before, Option.none());
        const bomb = started.bombPot !== undefined;

        const boards =
          sealedBoards.get(started.handNumber) ?? boardsAt(before, bomb);

        problems.push(...boardProblems(started, boards));
        doubleBoards += boards === 2 ? 1 : 0;
        bombPots += bomb ? 1 : 0;
        sealedBombPots += bomb && sealed !== undefined ? 1 : 0;

        if (bomb !== expected) {
          problems.push(
            `hand ${started.handNumber} was ${bomb ? "a bomb pot" : "dealt with blinds"}, ${sealed === undefined ? "the table" : "its seal"} said otherwise`
          );
        }

        problems.push(
          ...gameProblems(
            started,
            sealedGames.get(started.handNumber) ?? gameAt(before)
          )
        );

        if (bomb && RoomStates.$is("Open")(state) && state.bombCalled) {
          problems.push(`hand ${started.handNumber} did not spend its call`);
        }
      }

      previous = state;
    },
    room
  );

  return { bombPots, doubleBoards, problems, sealedBombPots };
};

describe("generated rooms with bomb pots", () => {
  it.prop(
    "a hand is a bomb pot exactly when the rules, the schedule, and the host's call said so, and is dealt as the game the rules named, when it was sealed, or when it was dealt if no seal held it; nothing after the seal changes its kind or its game, and a bomb pot spends the call",
    { source: session },
    ({ source }) => {
      expect(kindProblems(source).problems).toStrictEqual([]);
    },
    generated(10, 100)
  );

  it.prop(
    "in a checked room the same holds for every sealed hand",
    { source: session },
    ({ source }) => {
      expect(kindProblems(source, checkedRoom).problems).toStrictEqual([]);
    },
    generated(4, 100)
  );

  it.effect("reaches bomb pots, and bomb pots dealt from a seal", () =>
    Effect.gen(function* reachBombPots() {
      const sources = yield* Arbitrary.sampleEffect(session, {
        count: sized(40, 150),
        seed: 20_261_117,
      });

      const outcomes = sources.map((source, index) =>
        kindProblems(source, index % 3 === 0 ? checkedRoom : anyRoom)
      );

      expect(outcomes.flatMap((outcome) => outcome.problems)).toStrictEqual([]);

      let bombPots = 0;
      let sealedBombPots = 0;
      let doubleBoards = 0;

      for (const outcome of outcomes) {
        bombPots += outcome.bombPots;
        doubleBoards += outcome.doubleBoards;
        sealedBombPots += outcome.sealedBombPots;
      }

      expect(bombPots).toBeGreaterThan(sized(15, 60));
      expect(sealedBombPots).toBeGreaterThan(sized(1, 5));
      expect(doubleBoards).toBeGreaterThan(sized(5, 20));
    })
  );
});
