import { describe, expect, it } from "@effect/vitest";
import { Actions, Events, TableStates } from "@nostakes/engine";
import type { Action } from "@nostakes/engine";
import { Option, Result } from "effect";

import {
  Audiences,
  PublicHandStartedSchema,
  RoomCommands,
  RoomEvents,
  RoomViews,
  SeenEvents,
  audienceOf,
  deckFromBytes,
  redact,
  viewFor,
} from "../src/index.js";
import type { RoomView } from "../src/index.js";
import {
  ann,
  as,
  bob,
  bytesFrom,
  cat,
  dan,
  dealAt,
  join,
  ms,
  openOf,
  openedBy,
  run,
  runAll,
  seat,
  server,
  settings,
  sit,
} from "./fixtures.js";

const clocked = { ...settings, timeBankSeconds: 20, turnSeconds: 30 };

const seated = runAll(openedBy(ann, clocked), [
  join(bob),
  join(cat),
  join(dan),
  sit(ann, 0),
  sit(bob, 1),
  sit(cat, 2),
  RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
]);

const dealt = run(seated, dealAt(1000, 42));

const annSees = Audiences.Seated({ player: ann, seat: seat(0) });

const spectator = Audiences.Spectator();

const holeCardsOf = (index: number) => {
  const { table } = openOf(dealt.state);

  return TableStates.$is("InHand")(table)
    ? (table.hand.players.find((player) => player.seat === seat(index))
        ?.holeCards ?? [])
    : [];
};

const act = (who: typeof ann, action: Action, at: number) =>
  RoomCommands.Act({ action, at: ms(at), by: as(who) });

const expire = (deadline: number, at = deadline) =>
  RoomCommands.ExpireClock({ at: ms(at), by: server, deadline: ms(deadline) });

const openView = (view: RoomView) => {
  if (!RoomViews.$is("Open")(view)) {
    throw new Error("expected an open view");
  }

  return view;
};

const annTurn = (state: typeof dealt.state, at: number) =>
  openView(viewFor(state, annSees, ms(at))).clocks.turn;

describe("redaction", () => {
  it("removes the deck from the start of a hand for everyone", () => {
    const [started] = dealt.events;
    const deck = Result.getOrThrow(deckFromBytes(bytesFrom(42)));

    expect(started).toStrictEqual(
      RoomEvents.Table({
        at: ms(1000),
        event: Events.HandStarted({
          bigBlindSeat: seat(2),
          button: seat(0),
          dealtIn: [seat(0), seat(1), seat(2)],
          deck,
          handNumber: 1,
          smallBlindSeat: seat(1),
        }),
      })
    );

    for (const audience of [annSees, spectator]) {
      expect(
        started === undefined ? undefined : redact(started, audience)
      ).toStrictEqual(
        SeenEvents.Table({
          at: ms(1000),
          event: PublicHandStartedSchema.make({
            bigBlindSeat: seat(2),
            button: seat(0),
            dealtIn: [seat(0), seat(1), seat(2)],
            handNumber: 1,
            smallBlindSeat: seat(1),
          }),
        })
      );
    }
  });

  it("gives hole cards only to the seat they were dealt to, and the same event without cards to everyone else", () => {
    const dealing = dealt.events.flatMap((event) =>
      RoomEvents.$is("Table")(event) &&
      Events.$is("HoleCardsDealt")(event.event)
        ? [event]
        : []
    );

    const toAnn = dealing.map((event) => redact(event, annSees));
    const toSpectator = dealing.map((event) => redact(event, spectator));

    expect(toAnn).toStrictEqual([
      SeenEvents.Table({
        at: ms(1000),
        event: Events.HoleCardsDealt({ cards: [], seat: seat(1) }),
      }),
      SeenEvents.Table({
        at: ms(1000),
        event: Events.HoleCardsDealt({ cards: [], seat: seat(2) }),
      }),
      SeenEvents.Table({
        at: ms(1000),
        event: Events.HoleCardsDealt({ cards: holeCardsOf(0), seat: seat(0) }),
      }),
    ]);
    expect(
      toSpectator.every(
        (event) =>
          SeenEvents.$is("Table")(event) &&
          Events.$is("HoleCardsDealt")(event.event) &&
          event.event.cards.length === 0
      )
    ).toBe(true);
  });

  it("passes room events and public engine events through unchanged", () => {
    const joined = RoomEvents.MemberJoined({
      at: ms(1),
      avatar: "",
      name: "dan",
      player: dan,
    });

    const folded = RoomEvents.Table({
      at: ms(2),
      event: Events.Folded({ seat: seat(1) }),
    });

    expect(redact(joined, spectator)).toStrictEqual(joined);
    expect(redact(folded, annSees)).toStrictEqual(folded);
  });
});

describe("views", () => {
  it("shows a seated viewer their own cards and legal actions, with the clock as milliseconds remaining", () => {
    const view = openView(viewFor(dealt.state, annSees, ms(11_000)));

    expect(view.holeCards).toStrictEqual(holeCardsOf(0));
    expect(view.you).toStrictEqual(Option.some(ann));
    expect(view.legal.pipe(Option.map((legal) => legal.seat))).toStrictEqual(
      Option.some(seat(0))
    );
    expect(view.clocks.turn).toStrictEqual(
      Option.some({
        inTimeBank: false,
        remainingMs: 20_000,
        seat: seat(0),
        totalMs: 30_000,
      })
    );
    expect(
      view.hand.pipe(
        Option.map((hand) =>
          hand.players.map((player) => player.committedThisStreet)
        )
      )
    ).toStrictEqual(Option.some([0, 5, 10]));
    expect(view.hand.pipe(Option.map((hand) => hand.pots))).toStrictEqual(
      Option.some([])
    );
  });

  it("shows a spectator no hole cards and no legal actions", () => {
    const view = openView(viewFor(dealt.state, spectator, ms(1000)));

    expect(view.holeCards).toStrictEqual([]);
    expect(view.legal).toStrictEqual(Option.none());
    expect(view.you).toStrictEqual(Option.none());
    expect(
      view.seats.filter((entry) => Option.isSome(entry.occupant)).length
    ).toBe(3);
  });

  it("treats an audience that names a seat it does not hold as a spectator", () => {
    const pretender = Audiences.Seated({ player: dan, seat: seat(0) });
    const view = openView(viewFor(dealt.state, pretender, ms(1000)));

    expect(view.holeCards).toStrictEqual([]);
    expect(view.legal).toStrictEqual(Option.none());
  });

  it("finds the audience for a member from the seat they hold", () => {
    expect(audienceOf(dealt.state, ann)).toStrictEqual(annSees);
    expect(audienceOf(dealt.state, dan)).toStrictEqual(spectator);
  });
});

describe("pots in the middle", () => {
  it("collects each finished street into the pots and leaves this street's bets in front of the seats", () => {
    const flop = runAll(dealt.state, [
      RoomCommands.Act({ action: Actions.Call(), at: ms(1100), by: as(ann) }),
      RoomCommands.Act({ action: Actions.Call(), at: ms(1200), by: as(bob) }),
      RoomCommands.Act({ action: Actions.Check(), at: ms(1300), by: as(cat) }),
    ]);

    const view = openView(viewFor(flop, spectator, ms(1300)));

    expect(view.hand.pipe(Option.map((hand) => hand.pots))).toStrictEqual(
      Option.some([{ amount: 30, eligible: [seat(0), seat(1), seat(2)] }])
    );
    expect(
      view.hand.pipe(Option.map((hand) => hand.boards[0]?.length))
    ).toStrictEqual(Option.some(3));
  });
});

describe("clock lengths", () => {
  it("gives the turn clock its full length, and a time bank the seconds it held when it started, not the room's setting", () => {
    expect(annTurn(dealt.state, 11_000)).toStrictEqual(
      Option.some({
        inTimeBank: false,
        remainingMs: 20_000,
        seat: seat(0),
        totalMs: 30_000,
      })
    );

    const banked = run(dealt.state, expire(31_000, 31_250)).state;

    expect(annTurn(banked, 41_000)).toStrictEqual(
      Option.some({
        inTimeBank: true,
        remainingMs: 10_000,
        seat: seat(0),
        totalMs: 20_000,
      })
    );

    const onTheFlop = runAll(banked, [
      act(ann, Actions.Call(), 33_500),
      act(bob, Actions.Call(), 34_000),
      act(cat, Actions.Check(), 35_000),
      act(bob, Actions.Check(), 36_000),
      act(cat, Actions.Check(), 37_000),
      expire(67_000),
    ]);

    expect(annTurn(onTheFlop, 70_000)).toStrictEqual(
      Option.some({
        inTimeBank: true,
        remainingMs: 14_000,
        seat: seat(0),
        totalMs: 17_000,
      })
    );
  });
});
