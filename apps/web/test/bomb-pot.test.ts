import { describe, expect, it } from "@effect/vitest";
import {
  BombPots,
  ChipsSchema,
  Events,
  SeatIndexSchema,
} from "@nostakes/engine";
import {
  HandViewSchema,
  MillisSchema,
  PublicHandStartedSchema,
  RoomViewSchema,
  SeenEvents,
} from "@nostakes/room";
import { Option } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { bombPotLine, mayCallBombPot } from "../src/features/bomb-pot.js";
import { happeningsFrom } from "../src/features/table/from-room.js";
import { HappeningSchema } from "../src/features/table/snapshot.js";

const views = Arbitrary.schema(RoomViewSchema.cases.Open);

const hands = Arbitrary.schema(HandViewSchema);

const ANTE = 40;

const rule = BombPots.BombPots({ ante: ChipsSchema.make(ANTE), everyHands: 0 });

const seat = (index: number) => SeatIndexSchema.make(index);

const at = MillisSchema.make(0);

describe("what the page says about a bomb pot", () => {
  it.prop(
    "names the bomb pot coming next hand with its ante between hands, and says nothing during a hand, while the rule is off, or when none is coming",
    { hand: hands, view: views },
    ({ hand, view }) => {
      const on = {
        ...view,
        settings: {
          ...view.settings,
          table: { ...view.settings.table, bombPot: rule },
        },
      };

      const off = {
        ...view,
        settings: {
          ...view.settings,
          table: { ...view.settings.table, bombPot: BombPots.NoBombPots() },
        },
      };

      const between = { ...on, hand: Option.none() };

      expect([
        bombPotLine({
          ...on,
          hand: Option.some({ ...hand, bombPot: true }),
        }),
        bombPotLine({
          ...on,
          bombPot: { called: true, next: true },
          hand: Option.some({ ...hand, bombPot: false }),
        }),
        bombPotLine({ ...between, bombPot: { called: true, next: true } }),
        bombPotLine({ ...between, bombPot: { called: false, next: false } }),
        bombPotLine({
          ...off,
          bombPot: { called: true, next: true },
          hand: Option.some({ ...hand, bombPot: true }),
        }),
        mayCallBombPot(on),
        mayCallBombPot(off),
      ]).toStrictEqual([
        Option.none(),
        Option.none(),
        Option.some("Bomb pot next hand. Everyone antes 40."),
        Option.none(),
        Option.none(),
        true,
        false,
      ]);
    },
    { arbitrary: { runs: 20 } }
  );
});

const blindHand = {
  bigBlindSeat: seat(2),
  button: seat(0),
  dealtIn: [seat(0), seat(1), seat(2)],
  handNumber: 4,
  smallBlindSeat: seat(1),
};

const started = (bombPot: boolean) =>
  SeenEvents.Table({
    at,
    event: PublicHandStartedSchema.make(
      bombPot
        ? {
            ...blindHand,
            bombPot: {
              ante: ChipsSchema.make(ANTE),
              bigBlind: ChipsSchema.make(10),
            },
          }
        : blindHand
    ),
  });

const ante = (index: number, amount: number) =>
  SeenEvents.Table({
    at,
    event: Events.AntePosted({
      allIn: false,
      amount: ChipsSchema.make(amount),
      seat: seat(index),
    }),
  });

const said = (bombPot: boolean) =>
  happeningsFrom(
    0,
    [started(bombPot), ante(1, ANTE), ante(2, 15)].map((event, seq) => ({
      event,
      seq,
    }))
  ).flatMap(({ happening }) =>
    HappeningSchema.guards.Say(happening)
      ? [`${happening.seat}: ${happening.text}`]
      : []
  );

describe("the words for a bomb pot's antes on the table", () => {
  it("tags each seat with what it put into the bomb pot, and leaves an ordinary ante as it was", () => {
    expect(said(true)).toStrictEqual(["1: Bomb pot 40", "2: Bomb pot 15"]);
    expect(said(false)).toStrictEqual([]);
  });
});
