import { describe, expect, it } from "@effect/vitest";
import { Events, TableStates } from "@nostakes/engine";
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

const openView = (view: RoomView) => {
  if (!RoomViews.$is("Open")(view)) {
    throw new Error("expected an open view");
  }

  return view;
};

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
});

describe("views", () => {
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

  it("tells a member without a seat who they are, and shows them only what a spectator sees", () => {
    const danSees = audienceOf(dealt.state, dan);
    const view = openView(viewFor(dealt.state, danSees, ms(1000)));
    const watching = openView(viewFor(dealt.state, spectator, ms(1000)));

    expect(view.you).toStrictEqual(Option.some(dan));
    expect({ ...view, you: Option.none() }).toStrictEqual(watching);
    expect(dealt.events.map((event) => redact(event, danSees))).toStrictEqual(
      dealt.events.map((event) => redact(event, spectator))
    );
  });
});
