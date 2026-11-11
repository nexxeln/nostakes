import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { NewestHand } from "../src/features/moments/newest-hand.js";

const StepSchema = Schema.TaggedUnion({
  Idle: {
    slots: Schema.Int.check(Schema.isBetween({ maximum: 3, minimum: 1 })),
  },
  Render: {
    hand: Schema.NullOr(
      Schema.Int.check(Schema.isBetween({ maximum: 2, minimum: 0 }))
    ),
  },
});

type Step = typeof StepSchema.Type;

const plans = Arbitrary.array(Arbitrary.schema(StepSchema), {
  maxLength: 30,
  minLength: 1,
});

interface Hand {
  readonly key: string;
}

interface Played {
  readonly considered: readonly Hand[];
  readonly newestAtEach: readonly (Hand | null)[];
  readonly newest: Hand | null;
}

const play = (plan: readonly Step[]): Played => {
  const slots: (() => void)[] = [];
  const considered: Hand[] = [];
  const newestAtEach: (Hand | null)[] = [];

  const watch = new NewestHand<Hand>(
    ({ key }) => key,
    (work) => {
      slots.push(work);
    },
    (hand) => {
      considered.push(hand);
      newestAtEach.push(watch.hand);
    }
  );

  const runSlots = (count: number) => {
    for (const work of slots.splice(0, count)) {
      work();
    }
  };

  for (const step of plan) {
    StepSchema.match(step, {
      Idle: ({ slots: count }) => {
        runSlots(count);
      },
      Render: ({ hand }) => {
        watch.set(hand === null ? null : { key: `hand ${hand}` });
      },
    });
  }

  while (slots.length > 0) {
    runSlots(slots.length);
  }

  return { considered, newest: watch.hand, newestAtEach };
};

describe("the moment's idle look at the hand", () => {
  it("looks at the newest copy when the page redraws before the idle slot comes", () => {
    const played = play([
      StepSchema.cases.Render.make({ hand: 1 }),
      StepSchema.cases.Render.make({ hand: 1 }),
    ]);

    expect(played.considered).toStrictEqual([{ key: "hand 1" }]);
    expect(played.considered[0]).toBe(played.newest);
  });

  it.prop(
    "always ends having looked at the newest hand, whatever the page redraws and however late the idle slots run",
    { plan: plans },
    ({ plan }) => {
      const played = play(plan);

      const lastLook = played.considered.at(-1)?.key;

      expect(played.newest === null ? null : lastLook).toBe(
        played.newest?.key ?? null
      );
    },
    { arbitrary: { runs: 400 } }
  );

  it.prop(
    "only ever looks at the hand the page set last, and never at the same hand twice in a row",
    { plan: plans },
    ({ plan }) => {
      const played = play(plan);

      expect(
        played.considered.map((hand, index) => [
          hand === played.newestAtEach[index],
          hand.key === played.considered[index - 1]?.key,
        ])
      ).toStrictEqual(played.considered.map(() => [true, false]));
    },
    { arbitrary: { runs: 400 } }
  );
});
