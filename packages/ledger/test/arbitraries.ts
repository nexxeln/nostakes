import { Array as Arr, Order, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

export const between = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ maximum, minimum })));

const initial = Arbitrary.schema(
  Schema.Literals(["a", "b", "c", "d", "e", "f", "g", "h"])
);

export const playerNames = (count: number) =>
  Arbitrary.array(initial, { maxLength: count, minLength: count }).pipe(
    Arbitrary.map((initials) =>
      initials.map((letter, index) => `${letter}${index}`)
    )
  );

interface Keyed {
  readonly index: number;
  readonly key: number;
}

const byKeyThenIndex = Order.combine(
  Order.mapInput(Order.Number, (keyed: Keyed) => keyed.key),
  Order.mapInput(Order.Number, (keyed: Keyed) => keyed.index)
);

export const shuffled = <A>(
  values: readonly A[],
  sortKeys: readonly number[]
): readonly A[] =>
  Arr.map(
    Arr.sort(
      values.map((value, index) => ({
        index,
        key: sortKeys[index % sortKeys.length] ?? 0,
        value,
      })),
      byKeyThenIndex
    ),
    ({ value }) => value
  );

export const sortKeys = Arbitrary.array(between(0, 1000), {
  maxLength: 64,
  minLength: 64,
});
