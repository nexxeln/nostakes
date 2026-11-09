import { describe, expect, it } from "@effect/vitest";
import { Result } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  AmountSchema,
  balances,
  BoughtIn,
  CashedOut,
  NetSchema,
  settle,
  Unbalanced,
} from "../src/index.js";
import type { PlayerNet, Transfer } from "../src/index.js";
import { between, shuffled, sortKeys } from "./arbitraries.js";
import {
  fewestTransfersByBruteForce,
  nightOf,
  nonZeroPlayers,
  owedAfter,
} from "./nights.js";

const night = nightOf(0, 24);

const nightOfAtMostSeven = nightOf(0, 7);

const nightOfEightToTwelve = nightOf(8, 12);

const nets = (
  byPlayer: Readonly<Record<string, number>>
): readonly PlayerNet<string>[] =>
  Object.entries(byPlayer).map(([player, net]) => ({
    net: NetSchema.make(net),
    player,
  }));

const amountOf = (count: number) => AmountSchema.make(count);

const transfersOf = (
  rows: readonly PlayerNet<string>[]
): readonly Transfer<string>[] => Result.getOrThrow(settle(rows));

describe("settle", () => {
  it.prop(
    "brings every player to exactly zero with positive whole transfers between two different players",
    { night },
    ({ night: { rows } }) => {
      const transfers = transfersOf(rows);

      const evenPlayers = new Set(
        rows.filter(({ net }) => net === 0).map(({ player }) => player)
      );

      expect(
        [...owedAfter(rows, transfers).values()].every((owed) => owed === 0)
      ).toBe(true);

      for (const { amount, from, to } of transfers) {
        expect(Number.isSafeInteger(amount) && amount > 0).toBe(true);
        expect(from).not.toBe(to);
        expect(evenPlayers.has(from) || evenPlayers.has(to)).toBe(false);
      }
    }
  );

  it.prop(
    "uses at most one transfer fewer than the players with a non-zero net",
    { night },
    ({ night: { rows } }) => {
      expect(transfersOf(rows).length).toBeLessThanOrEqual(
        Math.max(0, nonZeroPlayers(rows) - 1)
      );
    }
  );

  it.prop(
    "matches the brute-force minimum for up to seven players",
    { night: nightOfAtMostSeven },
    ({ night: { rows } }) => {
      expect(transfersOf(rows)).toHaveLength(
        fewestTransfersByBruteForce(rows.map(({ net }) => net))
      );
    }
  );

  it.prop(
    "settles each hidden zero-sum group on its own for eight to twelve players",
    { night: nightOfEightToTwelve },
    ({ night: { hiddenGroups, rows } }) => {
      expect(transfersOf(rows).length).toBeLessThanOrEqual(
        nonZeroPlayers(rows) - hiddenGroups
      );
    }
  );

  it.prop(
    "gives the same list in the same order for any order of the rows",
    { keys: sortKeys, night },
    ({ keys, night: { rows } }) => {
      expect(settle(shuffled(rows, keys))).toStrictEqual(settle(rows));
    }
  );

  it.prop(
    "treats a net split over several rows for one player as their total",
    { night, splitAt: between(-50, 50) },
    ({ night: { rows }, splitAt }) => {
      const split = rows.flatMap(({ net, player }) => [
        { net: NetSchema.make(splitAt), player },
        { net: NetSchema.make(net - splitAt), player },
      ]);

      expect(settle(split)).toStrictEqual(settle(rows));
    }
  );

  it.prop(
    "refuses a night whose nets do not sum to zero and reports the sum",
    {
      night,
      stray: between(-1_000_000, 1_000_000).pipe(
        Arbitrary.filter((chips) => chips !== 0)
      ),
    },
    ({ night: { rows }, stray }) => {
      const unbalanced = [
        ...rows,
        { net: NetSchema.make(stray), player: "zz-stray" },
      ];

      expect(settle(unbalanced)).toStrictEqual(
        Result.fail(new Unbalanced({ sum: stray }))
      );
    }
  );
});

describe("settle scenarios", () => {
  it("has the loser of a heads-up night pay the winner", () => {
    expect(transfersOf(nets({ ann: 50, bob: -50 }))).toStrictEqual([
      { amount: 50, from: "bob", to: "ann" },
    ]);
  });

  it("cancels the pair of transfers through a player who broke even", () => {
    expect(transfersOf(nets({ ann: -20, bob: 0, cat: 20 }))).toStrictEqual([
      { amount: 20, from: "ann", to: "cat" },
    ]);
  });

  it("settles two independent zero-sum groups apart, where greedy matching needs four transfers", () => {
    expect(
      transfersOf(nets({ ann: -4, bob: -3, cat: -2, dan: 5, eve: 4 }))
    ).toStrictEqual([
      { amount: 4, from: "ann", to: "eve" },
      { amount: 3, from: "bob", to: "dan" },
      { amount: 2, from: "cat", to: "dan" },
    ]);
  });

  it("lists no transfers when everyone breaks even", () => {
    expect(transfersOf(nets({ ann: 0, bob: 0, cat: 0 }))).toStrictEqual([]);
  });

  it("has eight losers each pay the one winner", () => {
    expect(
      transfersOf(
        nets({
          ann: -10,
          bob: -20,
          cat: -30,
          dan: -40,
          eve: -50,
          fay: -60,
          gus: -70,
          hal: -80,
          ivy: 360,
        })
      )
    ).toStrictEqual([
      { amount: 10, from: "ann", to: "ivy" },
      { amount: 20, from: "bob", to: "ivy" },
      { amount: 30, from: "cat", to: "ivy" },
      { amount: 40, from: "dan", to: "ivy" },
      { amount: 50, from: "eve", to: "ivy" },
      { amount: 60, from: "fay", to: "ivy" },
      { amount: 70, from: "gus", to: "ivy" },
      { amount: 80, from: "hal", to: "ivy" },
    ]);
  });

  it("settles a player who rebought twice and still lost", () => {
    const rows = balances([
      BoughtIn({ amount: amountOf(100), player: "ann" }),
      BoughtIn({ amount: amountOf(100), player: "bob" }),
      BoughtIn({ amount: amountOf(100), player: "cat" }),
      BoughtIn({ amount: amountOf(100), player: "ann" }),
      CashedOut({ amount: amountOf(120), player: "cat" }),
      BoughtIn({ amount: amountOf(100), player: "ann" }),
      CashedOut({ amount: amountOf(80), player: "cat" }),
      CashedOut({ amount: amountOf(40), player: "ann" }),
      CashedOut({ amount: amountOf(260), player: "bob" }),
    ]);

    expect(rows).toStrictEqual([
      { boughtIn: 300, cashedOut: 40, net: -260, player: "ann" },
      { boughtIn: 100, cashedOut: 260, net: 160, player: "bob" },
      { boughtIn: 100, cashedOut: 200, net: 100, player: "cat" },
    ]);
    expect(settle(rows)).toStrictEqual(
      Result.succeed([
        { amount: 160, from: "ann", to: "bob" },
        { amount: 100, from: "ann", to: "cat" },
      ])
    );
  });

  it("says how to fix an unbalanced night", () => {
    expect(new Unbalanced({ sum: -25 }).message).toContain(
      "The nets sum to -25 chips instead of zero"
    );
  });
});
