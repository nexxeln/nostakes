import { describe, expect, it } from "@effect/vitest";
import {
  Actions,
  CardFromText,
  ChipsSchema,
  Events,
  ShowdownEntries,
  ShownCardsSchema,
  TableConfigSchema,
  WinningHandMustTable,
  evaluate,
} from "@nostakes/engine";
import type { Card, Event } from "@nostakes/engine";
import { Effect, Option, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  Audiences,
  Deadlines,
  RoomCommands,
  RoomEvents,
  RoomStates,
  RoomViews,
  TableRejected,
  decide,
  nextDeadline,
  redact,
  viewFor,
} from "../src/index.js";
import type {
  Audience,
  RoomEvent,
  RoomSettings,
  RoomState,
} from "../src/index.js";
import {
  ann,
  as,
  bob,
  bytesForDeck,
  cat,
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
import { asSent, cardsIn } from "./observers.js";
import { playSession, session } from "./sessions.js";
import type { Step } from "./sessions.js";

const card = Schema.decodeSync(CardFromText);

const cards = (text: string) => text.split(" ").map((word) => card(word));

const interactive: RoomSettings = {
  ...settings,
  showdownSeconds: 15,
  table: { ...settings.table, showdown: "Interactive" },
};

const BOB = "7c 2d";

const CAT = "Ah As";

const ANN = "Kh Ks";

const BOARD = "9c Jd 4s 3h 8d";

const checksDown = (chosen: RoomSettings) =>
  runAll(
    runAll(openedBy(ann, chosen), [
      join(bob),
      join(cat),
      sit(ann, 0, 100),
      sit(bob, 1, 100),
      sit(cat, 2, 100),
      RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
    ]),
    [
      RoomCommands.Deal({
        at: ms(10),
        by: server,
        shuffleBytes: bytesForDeck(
          `${BOB.slice(0, 2)} ${CAT.slice(0, 2)} ${ANN.slice(0, 2)} ${BOB.slice(3)} ${CAT.slice(3)} ${ANN.slice(3)} ${BOARD}`
        ),
      }),
      RoomCommands.Act({ action: Actions.Call(), at: ms(11), by: as(ann) }),
      RoomCommands.Act({ action: Actions.Call(), at: ms(12), by: as(bob) }),
      ...[13, 14, 15, 16, 17, 18, 19, 20, 21].map((at, index) =>
        RoomCommands.Act({
          action: Actions.Check(),
          at: ms(at),
          by: as([cat, bob, cat, ann, bob, cat, ann, bob, cat][index] ?? ann),
        })
      ),
    ]
  );

const river = (chosen: RoomSettings) =>
  run(
    checksDown(chosen),
    RoomCommands.Act({ action: Actions.Check(), at: ms(22), by: as(ann) })
  );

const tableHand = (who: typeof ann, at: number) =>
  RoomCommands.TableHand({ at: ms(at), by: as(who) });

const muckHand = (who: typeof ann, at: number) =>
  RoomCommands.MuckHand({ at: ms(at), by: as(who) });

const expire = (deadline: number, at = deadline) =>
  RoomCommands.ExpireClock({ at: ms(at), by: server, deadline: ms(deadline) });

const tableEvents = (events: readonly RoomEvent[]): readonly Event[] =>
  events.flatMap((event) =>
    RoomEvents.$is("Table")(event) ? [event.event] : []
  );

const showdownChoices = (events: readonly RoomEvent[]) =>
  tableEvents(events).filter(
    (event) =>
      Events.$is("HandTabled")(event) || Events.$is("HandMucked")(event)
  );

const tabled = (hole: string, index: number) =>
  Events.HandTabled({
    cards: cards(hole),
    rank: evaluate(cards(`${hole} ${BOARD}`)),
    seat: seat(index),
  });

const seatedAs = (who: typeof ann, index: number): Audience =>
  Audiences.Seated({ player: who, seat: seat(index) });

const AUDIENCES: readonly (readonly [string, Audience])[] = [
  ["ann", seatedAs(ann, 0)],
  ["bob", seatedAs(bob, 1)],
  ["cat", seatedAs(cat, 2)],
  ["a spectator", Audiences.Spectator()],
];

const leaked = (
  events: readonly RoomEvent[],
  state: RoomState,
  secret: readonly Card[],
  owner: string
) =>
  AUDIENCES.filter(([name]) => name !== owner).flatMap(([name, audience]) => {
    const sent = new Set([
      ...events.flatMap((event) =>
        cardsIn(asSent(redact(event, audience)), false)
      ),
      ...cardsIn(asSent(viewFor(state, audience, ms(100_000))), false),
    ]);

    return secret.flatMap((hidden) =>
      sent.has(hidden) ? [`${name} saw ${hidden}`] : []
    );
  });

describe("the showdown clock", () => {
  it("gives the seat asked showdownSeconds even with no turn clock, and a fresh clock to each seat asked", () => {
    const reached = river(interactive);

    expect(reached.events.at(-1)).toStrictEqual(
      RoomEvents.ShowdownClockStarted({
        at: ms(22),
        deadline: ms(15_022),
        seat: seat(1),
      })
    );
    expect(nextDeadline(reached.state)).toStrictEqual(
      Option.some(Deadlines.ShowdownClock({ at: ms(15_022), seat: seat(1) }))
    );

    const bobTabled = run(reached.state, tableHand(bob, 30));

    expect(bobTabled.events.at(-1)).toStrictEqual(
      RoomEvents.ShowdownClockStarted({
        at: ms(30),
        deadline: ms(15_030),
        seat: seat(2),
      })
    );
  });

  it("at expiry tables a seat that is first for a pot or must table, mucks a seat beaten in every pot, and marks nobody away, as an automatic showdown would", () => {
    const reached = river(interactive);
    const first = run(reached.state, expire(15_022));
    const second = run(first.state, expire(30_022));
    const third = run(second.state, expire(45_022));

    expect([
      ...showdownChoices(first.events),
      ...showdownChoices(second.events),
      ...showdownChoices(third.events),
    ]).toStrictEqual([
      tabled(BOB, 1),
      tabled(CAT, 2),
      Events.HandMucked({ seat: seat(0) }),
    ]);
    expect(
      tableEvents(river(settings).events).find(Events.$is("ShowdownReached"))
        ?.order
    ).toStrictEqual([
      ShowdownEntries.Shown({
        cards: cards(BOB),
        rank: evaluate(cards(`${BOB} ${BOARD}`)),
        seat: seat(1),
      }),
      ShowdownEntries.Shown({
        cards: cards(CAT),
        rank: evaluate(cards(`${CAT} ${BOARD}`)),
        seat: seat(2),
      }),
      ShowdownEntries.Mucked({ seat: seat(0) }),
    ]);
    expect(openOf(third.state).away).toStrictEqual([]);
    expect(
      [first, second, third].some((step) =>
        step.events.some(RoomEvents.$is("MarkedAway"))
      )
    ).toBe(false);
  });

  it("refuses a muck of a hand that beats every tabled hand, and lets the host act for the seat asked with the clock's choice", () => {
    const bobTabled = run(river(interactive).state, tableHand(bob, 30));

    expect(rejection(bobTabled.state, muckHand(cat, 31))).toStrictEqual(
      new TableRejected({
        rejection: new WinningHandMustTable({ pot: 1, seat: seat(2) }),
      })
    );
    expect(
      showdownChoices(
        run(
          bobTabled.state,
          RoomCommands.ActForSeat({ at: ms(32), by: as(ann), player: cat })
        ).events
      )
    ).toStrictEqual([tabled(CAT, 2)]);
  });

  it("chooses for a seat that is leaving as the clock would when the showdown reaches it, then waits on the next seat's own choice", () => {
    const leaving = run(
      checksDown(interactive),
      RoomCommands.LeaveSeat({ at: ms(22), by: as(cat) })
    ).state;

    const reached = run(
      leaving,
      RoomCommands.Act({ action: Actions.Check(), at: ms(23), by: as(ann) })
    );

    const bobMucked = run(reached.state, muckHand(bob, 24));

    expect(showdownChoices(reached.events)).toStrictEqual([]);
    expect(showdownChoices(bobMucked.events)).toStrictEqual([
      Events.HandMucked({ seat: seat(1) }),
      tabled(CAT, 2),
    ]);
    expect(nextDeadline(bobMucked.state)).toStrictEqual(
      Option.some(Deadlines.ShowdownClock({ at: ms(15_024), seat: seat(0) }))
    );
  });
});

describe("showdown views", () => {
  it("tells everyone whose turn it is to show, and only that seat which of its choices are legal, with the clock in milliseconds", () => {
    const reached = river(interactive).state;
    const bobView = viewFor(reached, seatedAs(bob, 1), ms(5022));
    const catView = viewFor(reached, seatedAs(cat, 2), ms(5022));

    expect(
      RoomViews.$is("Open")(bobView) && [
        bobView.showdown,
        bobView.hand.pipe(Option.map((hand) => hand.toShow)),
        bobView.clocks.showdown,
      ]
    ).toStrictEqual([
      Option.some({ canMuck: true, canTable: true, seat: seat(1) }),
      Option.some(Option.some(seat(1))),
      Option.some({ remainingMs: 10_000, seat: seat(1) }),
    ]);
    expect(RoomViews.$is("Open")(catView) && catView.showdown).toStrictEqual(
      Option.none()
    );

    const catAsked = viewFor(
      run(reached, tableHand(bob, 30)).state,
      seatedAs(cat, 2),
      ms(30)
    );

    expect(RoomViews.$is("Open")(catAsked) && catAsked.showdown).toStrictEqual(
      Option.some({ canMuck: false, canTable: true, seat: seat(2) })
    );
  });

  it("keeps the cards of seats that mucked, and of the seat that won without showing, from every other seat and spectator, until that seat shows them", () => {
    const reached = river(interactive);
    const bobMucked = run(reached.state, muckHand(bob, 30));
    const catMucked = run(bobMucked.state, muckHand(cat, 31));
    const hand = [...reached.events, ...bobMucked.events, ...catMucked.events];

    expect(
      tableEvents(catMucked.events).filter(Events.$is("PotAwarded"))
    ).toStrictEqual([
      Events.PotAwarded({
        amount: ChipsSchema.make(30),
        eligible: [seat(0), seat(1), seat(2)],
        pot: 1,
        run: 1,
        winners: [{ amount: ChipsSchema.make(30), seat: seat(0) }],
      }),
    ]);
    expect([
      ...leaked(hand, catMucked.state, cards(ANN), "ann"),
      ...leaked(hand, catMucked.state, cards(BOB), "bob"),
      ...leaked(hand, catMucked.state, cards(CAT), "cat"),
    ]).toStrictEqual([]);

    const shown = run(
      catMucked.state,
      RoomCommands.ShowCards({
        at: ms(40),
        by: as(ann),
        cards: ShownCardsSchema.make(cards(ANN)),
      })
    );

    expect(
      leaked(shown.events, shown.state, cards(ANN), "ann").length
    ).toBeGreaterThan(0);
  });
});

const isShowdownStart = (event: RoomEvent) =>
  RoomEvents.$is("Table")(event) && Events.$is("ShowdownStarted")(event.event);

const fromShowdown = (events: readonly RoomEvent[]) =>
  tableEvents(events.slice(events.findIndex(isShowdownStart)));

const everySeatTimesOut = (state: RoomState, started: readonly Event[]) => {
  const events = [...started];
  let current = state;

  for (let guard = 0; guard < 20; guard += 1) {
    const due = Option.getOrUndefined(nextDeadline(current));

    if (due === undefined || !Deadlines.$is("ShowdownClock")(due)) {
      break;
    }

    const expired = run(current, expire(due.at));

    events.push(...tableEvents(expired.events));
    current = expired.state;
  }

  return events;
};

const playedAutomatic = (step: Step): readonly Event[] => {
  if (!RoomStates.$is("Open")(step.before)) {
    return [];
  }

  const { before } = step;

  const config = TableConfigSchema.make({
    ...before.table.config,
    showdown: "Automatic",
  });

  const decision = decide(
    {
      ...before,
      settings: { ...before.settings, table: config },
      table: { ...before.table, config },
    },
    step.command
  );

  return Result.isSuccess(decision) ? tableEvents(decision.success) : [];
};

const seatsWhere = (events: readonly Event[], shown: boolean) =>
  events
    .flatMap((event) => {
      if (Events.$is("HandTabled")(event)) {
        return shown ? [event.seat] : [];
      }

      if (Events.$is("HandMucked")(event)) {
        return shown ? [] : [event.seat];
      }

      return Events.$is("ShowdownReached")(event)
        ? event.order.flatMap((entry) =>
            ShowdownEntries.$is("Shown")(entry) === shown ? [entry.seat] : []
          )
        : [];
    })
    .toSorted((left, right) => left - right);

const outcomeOf = (events: readonly Event[]) => ({
  awards: events.filter(Events.$is("PotAwarded")),
  ended: events.some(Events.$is("HandEnded")),
  mucked: seatsWhere(events, false),
  shown: seatsWhere(events, true),
});

const clockedShowdowns = (steps: readonly Step[]) =>
  steps.flatMap((step) =>
    step.events.some(isShowdownStart)
      ? [
          {
            automatic: outcomeOf(playedAutomatic(step)),
            timedOut: outcomeOf(
              everySeatTimesOut(step.after, fromShowdown(step.events))
            ),
          },
        ]
      : []
  );

describe("an interactive showdown where every seat times out", () => {
  it.prop(
    "ends with the same awards and the same shown and mucked seats as the same hand played Automatic",
    { source: session },
    ({ source }) => {
      const compared = clockedShowdowns(playSession(source).steps);

      expect(compared.map((outcome) => outcome.timedOut)).toStrictEqual(
        compared.map((outcome) => outcome.automatic)
      );
    }
  );

  it.effect(
    "is compared on many showdowns in a fixed sample, each ending its hand",
    () =>
      Effect.gen(function* coverShowdowns() {
        const sources = yield* Arbitrary.sampleEffect(session, {
          count: 60,
          seed: 20_261_110,
        });

        const compared = sources.flatMap((source) =>
          clockedShowdowns(playSession(source).steps)
        );

        expect(compared.length).toBeGreaterThan(20);
        expect(compared.every((outcome) => outcome.timedOut.ended)).toBe(true);
      })
  );
});
