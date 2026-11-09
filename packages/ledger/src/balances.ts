import { Array as Arr, Data, Order } from "effect";

import { NetSchema } from "./chips.js";
import type { Amount, Net } from "./chips.js";

export type LedgerEntry<P extends string> = Data.TaggedEnum<{
  BoughtIn: { readonly player: P; readonly amount: Amount };
  CashedOut: { readonly player: P; readonly amount: Amount };
}>;

interface LedgerEntryDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: LedgerEntry<this["A"] & string>;
}

export const {
  BoughtIn,
  CashedOut,
  $match: matchEntry,
} = Data.taggedEnum<LedgerEntryDefinition>();

export interface PlayerNet<P extends string> {
  readonly player: P;
  readonly net: Net;
}

export interface Balance<P extends string> extends PlayerNet<P> {
  readonly boughtIn: number;
  readonly cashedOut: number;
}

interface Totals {
  readonly boughtIn: number;
  readonly cashedOut: number;
}

const noTotals: Totals = { boughtIn: 0, cashedOut: 0 };

export const byPlayer = Order.mapInput(
  Order.String,
  (row: { readonly player: string }) => row.player
);

export const balances = <P extends string>(
  entries: readonly LedgerEntry<P>[]
): readonly Balance<P>[] => {
  const totals = new Map<P, Totals>();

  for (const entry of entries) {
    const current = totals.get(entry.player) ?? noTotals;

    totals.set(
      entry.player,
      matchEntry(entry, {
        BoughtIn: ({ amount }) => ({
          ...current,
          boughtIn: current.boughtIn + amount,
        }),
        CashedOut: ({ amount }) => ({
          ...current,
          cashedOut: current.cashedOut + amount,
        }),
      })
    );
  }

  return Arr.sort(
    [...totals].map(([player, { boughtIn, cashedOut }]) => ({
      boughtIn,
      cashedOut,
      net: NetSchema.make(cashedOut - boughtIn),
      player,
    })),
    byPlayer
  );
};
