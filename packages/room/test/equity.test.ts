import { describe, expect, it } from "@effect/vitest";
import { evaluate, handCategory } from "@nostakes/engine";
import type { Card } from "@nostakes/engine";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  SHARE_UNITS,
  bigHandTier,
  equities,
  favouriteTier,
  longShotTier,
  percentOf,
} from "../src/index.js";
import type { Equity, Tier } from "../src/index.js";
import { cardsOf } from "./moment-hands.js";
import { seededRandom } from "./random.js";
import type { SeededRandom } from "./random.js";

const seedSchema = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2_000_000_000, minimum: 1 }))
);

const dealFrom = (random: SeededRandom, count: number): readonly Card[] => {
  const deck = cardsOf(
    "2c 2d 2h 2s 3c 3d 3h 3s 4c 4d 4h 4s 5c 5d 5h 5s 6c 6d 6h 6s 7c 7d 7h 7s 8c 8d 8h 8s 9c 9d 9h 9s Tc Td Th Ts Jc Jd Jh Js Qc Qd Qh Qs Kc Kd Kh Ks Ac Ad Ah As"
  );

  const cards = [...deck];

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const other = random.below(index + 1);
    const held = cards[index];
    const swapped = cards[other];

    if (held !== undefined && swapped !== undefined) {
      cards[index] = swapped;
      cards[other] = held;
    }
  }

  return cards.slice(0, count);
};

const countedByHand = (
  hands: readonly (readonly Card[])[],
  board: readonly Card[]
) => {
  const used = new Set([...hands.flat(), ...board]);

  const rest = cardsOf(
    "2c 2d 2h 2s 3c 3d 3h 3s 4c 4d 4h 4s 5c 5d 5h 5s 6c 6d 6h 6s 7c 7d 7h 7s 8c 8d 8h 8s 9c 9d 9h 9s Tc Td Th Ts Jc Jd Jh Js Qc Qd Qh Qs Kc Kd Kh Ks Ac Ad Ah As"
  ).filter((card) => !used.has(card));

  const runouts: (readonly Card[])[] =
    board.length === 4
      ? rest.map((card) => [card])
      : rest.flatMap((first, index) =>
          rest.slice(index + 1).map((second) => [first, second])
        );

  const won = hands.map(() => 0);

  for (const runout of runouts) {
    const ranks = hands.map((hand) => evaluate([...hand, ...board, ...runout]));
    const best = Math.max(...ranks);
    const winners = ranks.filter((rank) => rank === best).length;

    for (const [index, rank] of ranks.entries()) {
      if (rank === best) {
        won[index] = (won[index] ?? 0) + SHARE_UNITS / winners;
      }
    }
  }

  return { shares: won, total: runouts.length * SHARE_UNITS };
};

const exactly = (hands: readonly string[], board = "") =>
  equities(
    hands.map((hand) => cardsOf(hand)),
    cardsOf(board),
    Number.POSITIVE_INFINITY
  );

const sampled = (hands: readonly string[], board = "") =>
  equities(
    hands.map((hand) => cardsOf(hand)),
    cardsOf(board)
  );

const share = (equity: Equity, index: number) =>
  (equity.shares[index] ?? 0) / equity.total;

const tierNumber = (tier: Option.Option<Tier>) =>
  Option.getOrElse(tier, () => 0);

describe("equity when the money went in", () => {
  it.prop(
    "counts every flop and turn run-out exactly, the way a hand-by-hand count does",
    { seed: seedSchema },
    ({ seed }) => {
      const random = seededRandom(seed);
      const players = 2 + random.below(4);
      const boardSize = random.chance(1, 2) ? 3 : 4;
      const cards = dealFrom(random, players * 2 + boardSize);

      const hands = Array.from({ length: players }, (_, index) =>
        cards.slice(index * 2, index * 2 + 2)
      );

      const board = cards.slice(players * 2);
      const equity = equities(hands, board);

      expect(equity.exact).toBe(true);
      expect({ shares: equity.shares, total: equity.total }).toStrictEqual(
        countedByHand(hands, board)
      );
    },
    { arbitrary: { runs: 30 } }
  );

  it("samples a preflop all in within half a point of the exact count, which gives aces 81 in 100 against kings of the other suits", () => {
    const matchups = [
      ["Ah As", "Kd Kc"],
      ["Ah Kh", "2c 2d"],
    ];

    const exact = matchups.map((hands) => exactly(hands));

    for (const [index, hands] of matchups.entries()) {
      const estimate = sampled(hands);
      const counted = exact[index] ?? estimate;

      expect(estimate.exact).toBe(false);
      expect(Math.abs(share(estimate, 0) - share(counted, 0))).toBeLessThan(
        0.005
      );
    }

    expect(exact.map((counted) => percentOf(counted, 0))).toStrictEqual([
      81, 50,
    ]);
  });

  it("gives the same estimate on every device for the same hands", () => {
    expect(sampled(["Ah As", "Kd Kc", "7c 2d"])).toStrictEqual(
      sampled(["Ah As", "Kd Kc", "7c 2d"])
    );
  });
});

describe("tiers rise with rarity", () => {
  it.prop(
    "a bigger favourite who loses is never a smaller bad beat, and a longer shot that wins is never a smaller suckout",
    {
      left: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ maximum: 1000, minimum: 0 }))
      ),
      right: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ maximum: 1000, minimum: 0 }))
      ),
    },
    ({ left, right }) => {
      const [low, high] = left <= right ? [left, right] : [right, left];
      const equity: Equity = { exact: true, shares: [low, high], total: 1000 };

      expect(tierNumber(favouriteTier(equity, 0))).toBeLessThanOrEqual(
        tierNumber(favouriteTier(equity, 1))
      );
      expect(tierNumber(longShotTier(equity, 0))).toBeGreaterThanOrEqual(
        tierNumber(longShotTier(equity, 1))
      );
    }
  );

  it.prop(
    "a rarer winning hand is never a quieter big hand",
    { seed: seedSchema },
    ({ seed }) => {
      const random = seededRandom(seed);

      const found = Array.from({ length: 400 }, () => {
        const cards = dealFrom(random, 7);
        const hole = cards.slice(0, 2);
        const board = cards.slice(2);

        return {
          rank: evaluate(cards),
          tier: tierNumber(bigHandTier(hole, board)),
        };
      }).filter(({ tier }) => tier > 0);

      const byRank = found.toSorted((left, right) => left.rank - right.rank);

      expect(byRank.map(({ tier }) => tier)).toStrictEqual(
        found.map(({ tier }) => tier).toSorted((left, right) => left - right)
      );
      expect(
        byRank.every(({ rank }) =>
          [
            "Flush",
            "FullHouse",
            "FourOfAKind",
            "StraightFlush",
            "RoyalFlush",
          ].includes(handCategory(rank))
        )
      ).toBe(true);
    }
  );
});
