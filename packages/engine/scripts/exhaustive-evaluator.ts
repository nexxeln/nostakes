import { CardSchema, evaluate, handCategory } from "@nostakes/engine";
import type { Card, HandCategory } from "@nostakes/engine";
import { Console, Effect, Schema } from "effect";

class CategoryCountsDiffer extends Schema.TaggedError<
  CategoryCountsDiffer,
  { readonly brand: unique symbol }
>()("CategoryCountsDiffer", { categories: Schema.Array(Schema.String) }) {}

const EXPECTED: readonly (readonly [HandCategory, number])[] = [
  ["RoyalFlush", 4324],
  ["StraightFlush", 37_260],
  ["FourOfAKind", 224_848],
  ["FullHouse", 3_473_184],
  ["Flush", 4_047_644],
  ["Straight", 6_180_020],
  ["ThreeOfAKind", 6_461_620],
  ["TwoPair", 31_433_400],
  ["OnePair", 58_627_800],
  ["HighCard", 23_294_460],
];

const ALL_CARDS: readonly Card[] = Schema.decodeSync(Schema.Array(CardSchema))(
  Array.from({ length: 52 }, (_, card) => card)
);

const countEveryHand = () => {
  const counts = new Map<HandCategory, number>();
  const hand: Card[] = [];

  const choose = (start: number) => {
    if (hand.length === 7) {
      const category = handCategory(evaluate(hand));

      counts.set(category, (counts.get(category) ?? 0) + 1);

      return;
    }

    for (const card of ALL_CARDS.slice(
      start,
      ALL_CARDS.length - (6 - hand.length)
    )) {
      hand.push(card);
      choose(card + 1);
      hand.pop();
    }
  };

  choose(0);

  return counts;
};

const program = Effect.gen(function* exhaustiveEvaluator() {
  const started = performance.now();
  const counts = countEveryHand();
  const seconds = (performance.now() - started) / 1000;
  let total = 0;

  for (const [category, expected] of EXPECTED) {
    const count = counts.get(category) ?? 0;

    total += count;
    yield* Console.log(
      `${category.padEnd(14)} ${String(count).padStart(11)}  expected ${String(expected).padStart(11)}`
    );
  }

  yield* Console.log(
    `${"total".padEnd(14)} ${String(total).padStart(11)}  in ${seconds.toFixed(1)} s on one thread`
  );

  const differing = EXPECTED.filter(
    ([category, expected]) => counts.get(category) !== expected
  );

  const verdict =
    differing.length === 0 && total === 133_784_560
      ? Console.log(
          "every seven-card category count matches the published table"
        )
      : Effect.fail(
          new CategoryCountsDiffer({
            categories: differing.map(([category]) => category),
          })
        );

  yield* verdict;
});

await Effect.runPromise(program);
