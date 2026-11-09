import { describe, expect, it } from "@effect/vitest";
import { Array as Arr, Order, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { AmountSchema, balances, BoughtIn, CashedOut } from "../src/index.js";
import type { LedgerEntry } from "../src/index.js";
import { playerNames, shuffled, sortKeys } from "./arbitraries.js";

const amount = Arbitrary.schema(
  AmountSchema.check(Schema.isBetween({ maximum: 1_000_000_000, minimum: 1 }))
);

const sessions = Arbitrary.array(
  Arbitrary.all([
    Arbitrary.array(amount, { maxLength: 4, minLength: 1 }),
    Arbitrary.array(amount, { maxLength: 4 }),
  ]),
  { maxLength: 9 }
).pipe(
  Arbitrary.flatMap((plans) =>
    playerNames(plans.length).pipe(
      Arbitrary.map((players) =>
        Arr.zipWith(players, plans, (player, [buyIns, cashOuts]) => ({
          buyIns,
          cashOuts,
          player,
        }))
      )
    )
  )
);

const sum = (amounts: readonly number[]): number =>
  Arr.reduce(amounts, 0, (total, chips) => total + chips);

describe("balances", () => {
  it.prop(
    "totals every buy-in and cash-out per player, in player order, whatever the entry order",
    { keys: sortKeys, sessions },
    ({ keys, sessions: plans }) => {
      const entries: readonly LedgerEntry<string>[] = shuffled(
        plans.flatMap(({ buyIns, cashOuts, player }) => [
          ...buyIns.map((chips) => BoughtIn({ amount: chips, player })),
          ...cashOuts.map((chips) => CashedOut({ amount: chips, player })),
        ]),
        keys
      );

      const rows = balances(entries);

      expect(rows).toStrictEqual(
        Arr.sort(
          plans.map(({ buyIns, cashOuts, player }) => ({
            boughtIn: sum(buyIns),
            cashedOut: sum(cashOuts),
            net: sum(cashOuts) - sum(buyIns),
            player,
          })),
          Order.mapInput(
            Order.String,
            (row: { readonly player: string }) => row.player
          )
        )
      );
      expect(sum(rows.map(({ net }) => net))).toBe(
        sum(plans.flatMap(({ cashOuts }) => cashOuts)) -
          sum(plans.flatMap(({ buyIns }) => buyIns))
      );
    }
  );
});
