import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { afterShowing, showOffer } from "../src/features/table/showing.js";
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
