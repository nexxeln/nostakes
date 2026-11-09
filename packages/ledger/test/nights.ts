import { Array as Arr, Order, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { NetSchema } from "../src/index.js";
import type { PlayerNet, Transfer } from "../src/index.js";
import { between, playerNames } from "./arbitraries.js";

const signedChips = (largest: number) =>
  Arbitrary.all([between(1, largest), Arbitrary.schema(Schema.Boolean)]).pipe(
    Arbitrary.map(([chips, owes]) => (owes ? -chips : chips))
  );

const zeroSumGroupOf = (largestChips: number, size: number) =>
  Arbitrary.array(signedChips(largestChips), {
    maxLength: size - 1,
    minLength: size - 1,
  }).pipe(
    Arbitrary.map((chips) => [
      ...chips,
      -Arr.reduce(chips, 0, (total, net) => total + net),
    ]),
    Arbitrary.filter((group) => group.at(-1) !== 0)
  );

const groupSizes = (count: number, startsNewGroup: readonly boolean[]) => {
  const sizes: number[] = [];
  let current = 0;

  for (const [position, startsNew] of startsNewGroup.entries()) {
    const remaining = count - position;

    if (startsNew && current >= 2 && remaining >= 2) {
      sizes.push(current);
      current = 0;
    }

    current += 1;
  }

  return current === 0 ? sizes : [...sizes, current];
};

export interface Night {
  readonly rows: readonly PlayerNet<string>[];
  readonly hiddenGroups: number;
}

const largestChips = Arbitrary.schema(
  Schema.Literals([9, 1000, 1_000_000_000])
);

const zeroSumGroups = (fewestPlayers: number, mostPlayers: number) =>
  between(fewestPlayers, mostPlayers).pipe(
    Arbitrary.flatMap((count) =>
      Arbitrary.all([
        largestChips,
        Arbitrary.array(Arbitrary.schema(Schema.Boolean), {
          maxLength: count === 1 ? 0 : count,
          minLength: count === 1 ? 0 : count,
        }),
      ])
    ),
    Arbitrary.flatMap(([largest, startsNewGroup]) =>
      Arbitrary.all(
        groupSizes(startsNewGroup.length, startsNewGroup).map((size) =>
          zeroSumGroupOf(largest, size)
        )
      )
    )
  );

export const nightOf = (fewestPlayers: number, mostPlayers: number) =>
  Arbitrary.all([
    zeroSumGroups(fewestPlayers, mostPlayers),
    between(0, 2),
  ]).pipe(
    Arbitrary.flatMap(([groups, evenPlayers]) => {
      const nets = [...groups.flat(), ...Arr.replicate(0, evenPlayers)];

      return playerNames(nets.length).pipe(
        Arbitrary.map((players): Night => ({
          hiddenGroups: groups.length,
          rows: Arr.zipWith(players, nets, (player, net) => ({
            net: NetSchema.make(net),
            player,
          })),
        }))
      );
    })
  );

export const nonZeroPlayers = (rows: readonly PlayerNet<string>[]): number =>
  rows.filter(({ net }) => net !== 0).length;

export const owedAfter = (
  rows: readonly PlayerNet<string>[],
  transfers: readonly Transfer<string>[]
): ReadonlyMap<string, number> => {
  const owed = new Map<string, number>();

  for (const { net, player } of rows) {
    owed.set(player, (owed.get(player) ?? 0) + net);
  }

  for (const { amount, from, to } of transfers) {
    owed.set(from, (owed.get(from) ?? 0) + amount);
    owed.set(to, (owed.get(to) ?? 0) - amount);
  }

  return owed;
};

export const fewestTransfersByBruteForce = (
  nets: readonly number[]
): number => {
  const known = new Map<string, number>();

  const search = (balances: readonly number[]): number => {
    const open = Arr.sort(
      balances.filter((balance) => balance !== 0),
      Order.Number
    );

    const key = open.join(",");
    const remembered = known.get(key);

    if (open.length === 0) {
      return 0;
    }

    if (remembered !== undefined) {
      return remembered;
    }

    let fewest = Number.POSITIVE_INFINITY;

    for (const [payer, settled] of open.entries()) {
      for (const [absorber, absorbing] of open.entries()) {
        if (payer !== absorber) {
          const next = open.with(absorber, absorbing + settled).with(payer, 0);

          fewest = Math.min(fewest, 1 + search(next));
        }
      }
    }

    known.set(key, fewest);

    return fewest;
  };

  return search(nets);
};
