import { describe, expect, it } from "@effect/vitest";
import { Result } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { NetSchema, settle, Unbalanced } from "../src/index.js";
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
