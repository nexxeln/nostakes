import { Array as Arr, Order, Result, Schema } from "effect";

import type { PlayerNet } from "./balances.js";
import { byPlayer } from "./balances.js";
import { AmountSchema } from "./chips.js";
import type { Amount } from "./chips.js";

export const exactSettlementLimit = 12;

export interface Transfer<P extends string> {
  readonly from: P;
  readonly to: P;
  readonly amount: Amount;
}

export class Unbalanced extends Schema.TaggedError<
  Unbalanced,
  { readonly brand: unique symbol }
>()("Unbalanced", {
  sum: Schema.Int,
}) {
  override get message() {
    return `The nets sum to ${this.sum} chips instead of zero, so chips were created or lost upstream. Record a CashedOut for every stack still on the table and check the entries, then settle again.`;
  }
}

interface Position<P extends string> {
  readonly player: P;
  readonly chips: number;
}

const largestFirst = Order.combine(
  Order.flip(
    Order.mapInput(Order.Number, (position: Position<string>) => position.chips)
  ),
  byPlayer
);

const byPayerThenPayee = Order.combine(
  Order.mapInput(Order.String, (transfer: Transfer<string>) => transfer.from),
  Order.mapInput(Order.String, (transfer: Transfer<string>) => transfer.to)
);

const nonZeroNets = <P extends string>(
  rows: readonly PlayerNet<P>[]
): readonly Position<P>[] => {
  const merged = new Map<P, number>();

  for (const { player, net } of rows) {
    merged.set(player, (merged.get(player) ?? 0) + net);
  }

  const nets: Position<P>[] = [];

  for (const [player, chips] of merged) {
    if (chips !== 0) {
      nets.push({ chips, player });
    }
  }

  return Arr.sort(nets, byPlayer);
};

const afterPaying = <P extends string>(
  positions: readonly Position<P>[],
  paid: number
): readonly Position<P>[] => {
  const [first, ...rest] = positions;

  if (first === undefined || first.chips === paid) {
    return rest;
  }

  return Arr.sort(
    [{ ...first, chips: first.chips - paid }, ...rest],
    largestFirst
  );
};

const matchLargest = <P extends string>(
  debtors: readonly Position<P>[],
  creditors: readonly Position<P>[]
): readonly Transfer<P>[] => {
  const [debtor] = debtors;
  const [creditor] = creditors;

  if (debtor === undefined || creditor === undefined) {
    return [];
  }

  const paid = Math.min(debtor.chips, creditor.chips);

  return [
    {
      amount: AmountSchema.make(paid),
      from: debtor.player,
      to: creditor.player,
    },
    ...matchLargest(afterPaying(debtors, paid), afterPaying(creditors, paid)),
  ];
};

const settleGreedily = <P extends string>(
  group: readonly Position<P>[]
): readonly Transfer<P>[] => {
  const debtors: Position<P>[] = [];
  const creditors: Position<P>[] = [];

  for (const { player, chips } of group) {
    if (chips < 0) {
      debtors.push({ chips: -chips, player });
    } else {
      creditors.push({ chips, player });
    }
  }

  return matchLargest(
    Arr.sort(debtors, largestFirst),
    Arr.sort(creditors, largestFirst)
  );
};

const isMember = (subset: number, member: number): boolean =>
  subset % 2 ** (member + 1) >= 2 ** member;

interface SubsetTable {
  readonly membersOf: (subset: number) => readonly number[];
  readonly sums: readonly number[];
  readonly zeroSumGroups: readonly number[];
}

const tabulateSubsets = (chips: readonly number[]): SubsetTable => {
  const memberIndexes = chips.map((_, member) => member);

  const membersOf = (subset: number): readonly number[] =>
    memberIndexes.filter((member) => isMember(subset, member));

  const sums = [0];
  const zeroSumGroups = [0];

  for (let subset = 1; subset < 2 ** chips.length; subset += 1) {
    const members = membersOf(subset);
    const [lowest = 0] = members;
    const sum = (sums[subset - 2 ** lowest] ?? 0) + (chips[lowest] ?? 0);

    const mostBefore = Math.max(
      ...members.map((member) => zeroSumGroups[subset - 2 ** member] ?? 0)
    );

    sums.push(sum);
    zeroSumGroups.push(mostBefore + (sum === 0 ? 1 : 0));
  }

  return { membersOf, sums, zeroSumGroups };
};

const largestZeroSumPartition = <P extends string>(
  nets: readonly Position<P>[]
): readonly (readonly Position<P>[])[] => {
  const { membersOf, sums, zeroSumGroups } = tabulateSubsets(
    nets.map(({ chips }) => chips)
  );

  const partition: (readonly Position<P>[])[] = [];
  let closedAt = 2 ** nets.length - 1;
  let subset = closedAt;

  while (subset !== 0) {
    const remaining = subset;
    const closes = sums[remaining] === 0 ? 1 : 0;

    const peeled =
      membersOf(remaining).find(
        (member) =>
          (zeroSumGroups[remaining - 2 ** member] ?? 0) + closes ===
          zeroSumGroups[remaining]
      ) ?? 0;

    subset -= 2 ** peeled;

    if (sums[subset] === 0) {
      const group = closedAt - subset;

      partition.push(nets.filter((_, member) => isMember(group, member)));
      closedAt = subset;
    }
  }

  return partition;
};

export const settle = <P extends string>(
  rows: readonly PlayerNet<P>[]
): Result.Result<readonly Transfer<P>[], Unbalanced> => {
  const nets = nonZeroNets(rows);
  const sum = Arr.reduce(nets, 0, (total, { chips }) => total + chips);

  if (sum !== 0) {
    return Result.fail(new Unbalanced({ sum }));
  }

  const groups =
    nets.length <= exactSettlementLimit
      ? largestZeroSumPartition(nets)
      : [nets];

  return Result.succeed(
    Arr.sort(
      groups.flatMap((group) => settleGreedily(group)),
      byPayerThenPayee
    )
  );
};
