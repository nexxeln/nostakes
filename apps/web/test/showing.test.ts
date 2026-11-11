import { describe, expect, it } from "@effect/vitest";
import { NotInLastHand, SeatIndexSchema } from "@nostakes/engine";
import { HandViewSchema, RoomViewSchema, TableRejected } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { rejectionText } from "../src/features/rejections.js";
import {
  afterShowing,
  hiddenOf,
  showdownWords,
  showOffer,
} from "../src/features/table/showing.js";
import type { ShowState } from "../src/features/table/showing.js";

const DECK = ["Ad", "Kh", "7c", "2s", "Td", "Qh"] as const;

const ShowPlanSchema = Schema.Struct({
  bothOnly: Schema.Boolean,
  first: Schema.Int.check(Schema.isBetween({ maximum: 5, minimum: 0 })),
  second: Schema.Int.check(Schema.isBetween({ maximum: 5, minimum: 0 })),
  shownFirst: Schema.Boolean,
  shownSecond: Schema.Boolean,
});

type ShowPlan = typeof ShowPlanSchema.Type;

const plans = Arbitrary.schema(ShowPlanSchema);

const stateOf = (plan: ShowPlan): ShowState => {
  const first = DECK[plan.first] ?? "Ad";
  const step = plan.second === plan.first ? 1 : 0;

  const second = DECK[(plan.second + step) % DECK.length] ?? "Kh";

  return {
    bothOnly: plan.bothOnly,
    held: [first, second],
    shown: [
      ...(plan.shownFirst ? [first] : []),
      ...(plan.shownSecond ? [second] : []),
    ],
  };
};

type Tap = { readonly card: string } | "Both";

const tapsOf = (state: ShowState): readonly Tap[] => [
  ...state.held.map((card) => ({ card })),
  ...DECK.filter((card) => !state.held.includes(card))
    .slice(0, 1)
    .map((card) => ({ card })),
  "Both",
];

const sentBy = (state: ShowState, tap: Tap): readonly string[] => {
  const offer = showOffer(state);

  if (offer === null) {
    return [];
  }

  return tap === "Both" ? offer.bothCards : offer.tap(tap.card);
};

const legalShow = (state: ShowState, cards: readonly string[]) => {
  const hidden = hiddenOf(state);

  return (
    cards.length > 0 &&
    cards.every((card) => hidden.includes(card)) &&
    new Set(cards).size === cards.length &&
    (!state.bothOnly || hidden.every((card) => cards.includes(card)))
  );
};

const legalShows = (state: ShowState): readonly (readonly string[])[] => {
  const hidden = hiddenOf(state);

  const subsets = [
    ...hidden.map((card) => [card]),
    ...(hidden.length > 1 ? [hidden] : []),
  ];

  return subsets.filter((cards) => legalShow(state, cards));
};

const sameCards = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((card) => right.includes(card));

const reachedWithin = (
  state: ShowState,
  wanted: readonly string[],
  taps: number
): boolean => {
  const target = [...state.shown, ...wanted];

  const walk = (current: ShowState, left: number): boolean => {
    if (sameCards(current.shown, target)) {
      return true;
    }

    if (left === 0) {
      return false;
    }

    return tapsOf(current).some((tap) => {
      const cards = sentBy(current, tap);

      return (
        cards.length > 0 &&
        cards.every((card) => wanted.includes(card)) &&
        walk(afterShowing(current, cards), left - 1)
      );
    });
  };

  return walk(state, taps);
};

describe("showing your cards after a hand", () => {
  it.prop(
    "never offers a show the room would refuse: only hidden cards, each once, and both of them when the room shows both or none",
    { plan: plans },
    ({ plan }) => {
      const state = stateOf(plan);

      const offered = tapsOf(state)
        .map((tap) => sentBy(state, tap))
        .filter((cards) => cards.length > 0);

      expect(offered.every((cards) => legalShow(state, cards))).toBe(true);
    }
  );

  it.prop(
    "never offers a card already shown, and says nothing once every card is shown",
    { plan: plans },
    ({ plan }) => {
      const state = stateOf(plan);
      const offer = showOffer(state);
      const hidden = hiddenOf(state);

      expect(offer === null).toBe(hidden.length === 0);

      const offered = tapsOf(state).flatMap((tap) => sentBy(state, tap));

      expect(
        offered.filter((card) => state.shown.includes(card))
      ).toStrictEqual([]);
    }
  );

  it.prop(
    "describes the next action and never one already taken",
    { plan: plans },
    ({ plan }) => {
      const state = stateOf(plan);
      const offer = showOffer(state);
      const hidden = hiddenOf(state);

      if (offer === null) {
        return;
      }

      expect(offer.hint.includes("other")).toBe(
        hidden.length === 1 && state.shown.length > 0
      );
      expect(offer.hint.includes("both") || offer.both === "Show both").toBe(
        hidden.length > 1
      );
      expect(offer.sub !== "").toBe(state.bothOnly && hidden.length > 1);
    }
  );

  it.prop(
    "reaches every show the room allows in at most two taps",
    { plan: plans },
    ({ plan }) => {
      const state = stateOf(plan);

      const unreachable = legalShows(state).filter(
        (cards) => !reachedWithin(state, cards, 2)
      );

      expect(unreachable).toStrictEqual([]);
    }
  );

  it.prop(
    "shows one card with one tap and both with one action when the room lets you choose",
    { plan: plans },
    ({ plan }) => {
      const state = stateOf({
        ...plan,
        bothOnly: false,
        shownFirst: false,
        shownSecond: false,
      });

      expect(
        state.held.map((card) => reachedWithin(state, [card], 1))
      ).toStrictEqual([true, true]);
      expect(reachedWithin(state, state.held, 1)).toBe(true);
    }
  );
});

describe("a showdown where you must table or muck", () => {
  it("says how to show and how to muck, or why a winning hand cannot be mucked", () => {
    expect([
      showdownWords({ muck: true, show: true }),
      showdownWords({ muck: false, show: true }),
      showdownWords({ muck: false, show: false }),
    ]).toStrictEqual([
      { hint: "Tap your cards to show them", sub: "or flick them up to muck" },
      {
        hint: "Tap your cards to show them",
        sub: "A winning hand must be shown.",
      },
      null,
    ]);
  });
});

const views = Arbitrary.schema(RoomViewSchema.cases.Open);

const hands = Arbitrary.schema(HandViewSchema);

describe("a show that reaches the room after the next deal", () => {
  it.prop(
    "says the last hand is closed rather than that you were not in it",
    { hand: hands, table: views },
    ({ hand, table }) => {
      const late = new TableRejected({
        rejection: new NotInLastHand({ seat: SeatIndexSchema.make(0) }),
      });

      expect([
        rejectionText(late, Option.some({ ...table, hand: Option.some(hand) })),
        rejectionText(late, Option.some({ ...table, hand: Option.none() })),
      ]).toStrictEqual([
        "The next hand is already dealt, so the last one is closed.",
        "You were not dealt into the last hand.",
      ]);
    },
    { arbitrary: { runs: 20 } }
  );
});
