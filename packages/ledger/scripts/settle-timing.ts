import { exactSettlementLimit, NetSchema, settle } from "@nostakes/ledger";
import type { PlayerNet } from "@nostakes/ledger";
import { Array as Arr, Clock, Console, Effect, Order, Schema } from "effect";

const budgetMillis = 50;

const rounds = 200;

class SettleTooSlow extends Schema.TaggedError<
  SettleTooSlow,
  { readonly brand: unique symbol }
>()("SettleTooSlow", {
  night: Schema.String,
  slowestMillis: Schema.Finite,
}) {
  override get message() {
    return `Settling "${this.night}" took ${this.slowestMillis} ms, over the ${budgetMillis} ms budget. Lower exactSettlementLimit or speed up the subset table in src/settle.ts.`;
  }
}

const tableOf = (nets: readonly number[]): readonly PlayerNet<string>[] =>
  nets.map((net, index) => ({
    net: NetSchema.make(net),
    player: `p${String(index).padStart(2, "0")}`,
  }));

const nights: readonly (readonly [string, readonly number[]])[] = [
  [
    "one group with no zero-sum subgroup",
    [-2047, ...Arr.makeBy(exactSettlementLimit - 1, (power) => 2 ** power)],
  ],
  [
    "six independent pairs",
    Arr.makeBy(exactSettlementLimit, (index) =>
      index % 2 === 0 ? -(index + 1) : index
    ),
  ],
  ["mixed groups", [-9, -7, -5, -3, 1, 2, 3, 4, 5, 6, 2, 1]],
];

const millis = (nanos: bigint): number => Number(nanos) / 1_000_000;

const timeNight = Effect.fnUntraced(function* timeNight(
  name: string,
  nets: readonly number[]
) {
  const rows = tableOf(nets);
  const durations: bigint[] = [];
  let transfers = 0;

  for (let round = 0; round < rounds; round += 1) {
    const started = yield* Clock.currentTimeNanos;
    const settled = yield* Effect.fromResult(settle(rows));
    const finished = yield* Clock.currentTimeNanos;

    durations.push(finished - started);
    transfers = settled.length;
  }

  const sorted = Arr.sort(durations, Order.BigInt);
  const slowestMillis = millis(sorted.at(-1) ?? 0n);
  const medianMillis = millis(sorted[Math.floor(sorted.length / 2)] ?? 0n);

  yield* Console.log(
    `${nets.length} players, ${name}: ${transfers} transfers, median ${medianMillis.toFixed(3)} ms, slowest ${slowestMillis.toFixed(3)} ms over ${rounds} rounds`
  );

  if (slowestMillis >= budgetMillis) {
    return yield* new SettleTooSlow({ night: name, slowestMillis });
  }

  return slowestMillis;
});

const program = Effect.forEach(
  nights,
  ([name, nets]) => timeNight(name, nets),
  {
    discard: true,
  }
);

await Effect.runPromise(program);
