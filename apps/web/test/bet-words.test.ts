import { describe, expect, it } from "@effect/vitest";
import { ChipsSchema, Events, SeatIndexSchema } from "@nostakes/engine";
import {
  HandViewSchema,
  MillisSchema,
  PublicHandStartedSchema,
  RoomViewSchema,
  SeenEvents,
} from "@nostakes/room";
import type { SeenEvent } from "@nostakes/room";
import { Option } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { betFacedIn, happeningsFrom } from "../src/features/table/from-room.js";
import { HappeningSchema } from "../src/features/table/snapshot.js";

const AT = MillisSchema.make(0);

const seat = (index: number) => SeatIndexSchema.make(index);

const chips = (amount: number) => ChipsSchema.make(amount);

const table = (event: Parameters<typeof SeenEvents.Table>[0]["event"]) =>
  SeenEvents.Table({ at: AT, event });

const started = table(
  PublicHandStartedSchema.make({
    bigBlindSeat: seat(2),
    button: seat(0),
    dealtIn: [seat(0), seat(1), seat(2), seat(3), seat(4)],
    handNumber: 4,
    smallBlindSeat: seat(1),
  })
);

const blind = (
  at: number,
  amount: number,
  kind: "Small" | "Big",
  dead = false
) =>
  table(
    Events.BlindPosted({
      allIn: false,
      amount: chips(amount),
      blind: kind,
      dead,
      seat: seat(at),
    })
  );

const blinds = [started, blind(1, 1, "Small"), blind(2, 2, "Big")];

const raiseTo = (at: number, to: number) =>
  table(
    Events.RaisedTo({
      added: chips(to),
      allIn: false,
      full: true,
      seat: seat(at),
      to: chips(to),
    })
  );

const call = (at: number, amount: number) =>
  table(Events.Called({ allIn: false, amount: chips(amount), seat: seat(at) }));

const flop = table(Events.StreetDealt({ cards: [], run: 1, street: "Flop" }));

const straddle = table(
  Events.StraddlePosted({ amount: chips(4), seat: seat(3) })
);

const words = (facing: number, events: readonly SeenEvent[]) =>
  happeningsFrom(
    facing,
    events.map((event, seq) => ({ event, seq }))
  ).flatMap(({ happening }) =>
    HappeningSchema.guards.Bet(happening)
      ? [happening.raise ? `Raise to ${happening.to}` : `Bet ${happening.to}`]
      : []
  );

describe("the word for a bet on the table", () => {
  it("calls a preflop raise a raise, whoever makes it and whatever was posted", () => {
    expect([
      words(0, [...blinds, raiseTo(3, 8)]),
      words(0, [...blinds, call(3, 2), call(1, 1), raiseTo(2, 6)]),
      words(0, [...blinds, straddle, raiseTo(4, 12)]),
      words(0, [
        ...blinds,
        blind(4, 2, "Big"),
        blind(4, 1, "Small", true),
        raiseTo(0, 6),
      ]),
      words(0, [
        started,
        blind(1, 1, "Small"),
        blind(4, 1, "Small", true),
        raiseTo(0, 3),
      ]),
    ]).toStrictEqual([
      ["Raise to 8"],
      ["Raise to 6"],
      ["Raise to 12"],
      ["Raise to 6"],
      ["Raise to 3"],
    ]);
  });

  it("calls the first bet on a later street a bet, and the next one a raise", () => {
    expect(
      words(0, [
        ...blinds,
        call(3, 2),
        call(1, 1),
        flop,
        raiseTo(1, 4),
        raiseTo(2, 12),
      ])
    ).toStrictEqual(["Bet 4", "Raise to 12"]);
  });

  it("starts from what the room showed before the batch, so a page that joins mid-street still says raise", () => {
    expect([
      words(2, [raiseTo(3, 8)]),
      words(0, [raiseTo(3, 8)]),
    ]).toStrictEqual([["Raise to 8"], ["Bet 8"]]);
  });

  it.prop(
    "reads the bet to face from the highest chips anyone put in on this street",
    {
      hand: Arbitrary.schema(HandViewSchema),
      view: Arbitrary.schema(RoomViewSchema.cases.Open),
    },
    ({ hand, view }) => {
      const highest = Math.max(
        0,
        ...hand.players.map(({ committedThisStreet }) => committedThisStreet)
      );

      expect([
        betFacedIn(Option.some({ ...view, hand: Option.some(hand) })),
        betFacedIn(Option.some({ ...view, hand: Option.none() })),
        betFacedIn(Option.none()),
      ]).toStrictEqual([highest, 0, 0]);
    },
    { arbitrary: { runs: 50 } }
  );
});
