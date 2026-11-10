import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import {
  Actions,
  Antes,
  Commands,
  Events,
  ShowdownEntries,
  TableStates,
  evaluate,
  legalActions,
} from "../../src/index.js";
import type { Event, TableState } from "../../src/index.js";
import {
  baseConfig,
  calls,
  cards,
  checks,
  chipCount,
  deckStartingWith,
  folds,
  handOf,
  occupiedTable,
  play,
  raisesTo,
  run,
  seat,
  stacksOf,
  startHand,
} from "../fixtures.js";

const potsOf = (events: readonly Event[]) =>
  events.filter((event) => Events.$is("PotAwarded")(event));

const pot = (
  amount: number,
  eligible: readonly number[],
  number: number,
  winners: readonly (readonly [number, number])[]
) =>
  Events.PotAwarded({
    amount: chipCount(amount),
    eligible: eligible.map((index) => seat(index)),
    pot: number,
    run: 1,
    winners: winners.map(([index, share]) => ({
      amount: chipCount(share),
      seat: seat(index),
    })),
  });

const smallBlindFoldsThenCheckDown = (start: TableState) => {
  let state = start;
  const events: Event[] = [];
  const small = handOf(start).smallBlindSeat;

  for (
    let legal = legalActions(state);
    Option.isSome(legal);
    legal = legalActions(state)
  ) {
    const { canCheck, seat: toAct } = legal.value;
    const preflop = handOf(state).street === "Preflop";

    const passive = canCheck ? Actions.Check() : Actions.Call();

    const action =
      toAct === small && preflop && !canCheck ? Actions.Fold() : passive;

    const step = run(state, Commands.Act({ action, seat: toAct }));

    ({ state } = step);
    events.push(...step.events);
  }

  return { events, state };
};

describe("pot edges (rules 15 to 17)", () => {
  it("Rule 16: five all-ins of 100 to 500 under a covering raise build a main pot and four side pots, after the uncalled 500 returns", () => {
    const allIn = play(
      startHand(
        occupiedTable(baseConfig, {
          0: 100,
          1: 200,
          2: 300,
          3: 400,
          4: 500,
          5: 1000,
        }),
        deckStartingWith("2c 3d 4h 5s 7c 9d 2d 3h 4s 5c 7d 9h Ah Kh Qh 8c 8d")
      ).state,
      [
        [3, calls],
        [4, calls],
        [5, raisesTo(1000)],
        [0, calls],
        [1, calls],
        [2, calls],
        [3, calls],
        [4, calls],
      ]
    );

    expect(
      allIn.events.filter((event) => Events.$is("UncalledBetReturned")(event))
    ).toStrictEqual([
      Events.UncalledBetReturned({ amount: chipCount(500), seat: seat(5) }),
    ]);
    expect(potsOf(allIn.events)).toStrictEqual([
      pot(600, [0, 1, 2, 3, 4, 5], 1, [[0, 600]]),
      pot(500, [1, 2, 3, 4, 5], 2, [[5, 500]]),
      pot(400, [2, 3, 4, 5], 3, [[5, 400]]),
      pot(300, [3, 4, 5], 4, [[5, 300]]),
      pot(200, [4, 5], 5, [[5, 200]]),
    ]);
    expect(stacksOf(allIn.state).slice(0, 6)).toStrictEqual([
      600, 0, 0, 0, 0, 1900,
    ]);
  });

  it("Rule 16: a seat that put 300 in and folded feeds both pots, is eligible for neither, and the live bettor's uncalled 700 comes back", () => {
    const hand = play(
      startHand(
        occupiedTable(baseConfig, { 0: 1000, 1: 1000, 2: 1000, 3: 150 }),
        deckStartingWith("Ac Kc Qc Jc Tc 9c 2d 3d 4d 5h 6h 7s 8s")
      ).state,
      [
        [3, calls],
        [0, raisesTo(300)],
        [1, calls],
        [2, folds],
        [3, calls],
        [1, raisesTo(700)],
        [0, folds],
      ]
    );

    expect(
      hand.events.filter((event) => Events.$is("UncalledBetReturned")(event))
    ).toStrictEqual([
      Events.UncalledBetReturned({ amount: chipCount(700), seat: seat(1) }),
    ]);
    expect(potsOf(hand.events)).toStrictEqual([
      pot(460, [1, 3], 1, [
        [1, 230],
        [3, 230],
      ]),
      pot(300, [1], 2, [[1, 300]]),
    ]);
    expect(stacksOf(hand.state).slice(0, 4)).toStrictEqual([
      700, 1230, 990, 230,
    ]);
  });

  it("Rule 15: when a big blind all in for 7 of a 10-chip ante is the last seat in, each folder gets back what it never matched, and a big-blind ante stays in the pot", () => {
    const shortAnte = play(
      startHand(
        occupiedTable(
          { ...baseConfig, ante: Antes.EveryPlayer({ amount: chipCount(10) }) },
          { 0: 1000, 1: 1000, 2: 7 }
        ),
        deckStartingWith("Ac Kc Qc Jc Tc 9c")
      ).state,
      [
        [0, folds],
        [1, folds],
      ]
    );

    const bigBlindAnte = play(
      startHand(
        occupiedTable(
          {
            ...baseConfig,
            ante: Antes.BigBlindPays({ amount: chipCount(20) }),
          },
          { 0: 1000, 1: 1000, 2: 15 }
        ),
        deckStartingWith("Ac Kc Qc Jc Tc 9c")
      ).state,
      [
        [0, folds],
        [1, folds],
      ]
    );

    expect(shortAnte.events.slice(2)).toStrictEqual([
      Events.UncalledBetReturned({ amount: chipCount(8), seat: seat(1) }),
      Events.UncalledBetReturned({ amount: chipCount(3), seat: seat(0) }),
      pot(21, [2], 1, [[2, 21]]),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(shortAnte.state).slice(0, 3)).toStrictEqual([993, 993, 21]);
    expect(bigBlindAnte.events.slice(2)).toStrictEqual([
      Events.UncalledBetReturned({ amount: chipCount(5), seat: seat(2) }),
      pot(15, [2], 1, [[2, 15]]),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(bigBlindAnte.state).slice(0, 3)).toStrictEqual([
      1000, 995, 20,
    ]);
  });

  it("Rule 17: in a three-way split of 35 chips, the two odd chips go to the first tied winners after the button, for every button position", () => {
    const seats = [1, 4, 6, 8];

    let state = occupiedTable(
      baseConfig,
      Object.fromEntries(seats.map((index) => [index, 1000]))
    );

    const splits: (readonly (readonly [number, number])[])[] = [];

    for (const _hand of seats) {
      const played = smallBlindFoldsThenCheckDown(
        startHand(
          state,
          deckStartingWith("2c 3c 4c 5c 2d 3d 4d 5d As Ks Qs Js Ts")
        ).state
      );

      splits.push(
        potsOf(played.events).flatMap((awarded) =>
          awarded.winners.map((share) => [share.seat, share.amount] as const)
        )
      );
      ({ state } = played);
    }

    expect(TableStates.$is("BetweenHands")(state)).toBe(true);
    expect(splits).toStrictEqual([
      [
        [6, 12],
        [8, 12],
        [1, 11],
      ],
      [
        [8, 12],
        [1, 12],
        [4, 11],
      ],
      [
        [1, 12],
        [4, 12],
        [6, 11],
      ],
      [
        [4, 12],
        [6, 12],
        [8, 11],
      ],
    ]);
  });
});

const RIVER_BOARD = "2h 7d 9c Jh 3s";

const threePots = (seatThree: string, river: "raised" | "checked") => {
  const [first = "", second = ""] = seatThree.split(" ");

  const started = startHand(
    occupiedTable(baseConfig, { 0: 1000, 1: 40, 2: 120, 3: 1000, 4: 1000 }),
    deckStartingWith(
      `As Ks ${first} Qs 6s Ac Kc ${second} Qc 6c ${RIVER_BOARD}`
    )
  ).state;

  const toRiver = play(started, [
    [3, raisesTo(40)],
    [4, calls],
    [0, folds],
    [1, calls],
    [2, calls],
    [2, raisesTo(80)],
    [3, calls],
    [4, calls],
    [3, checks],
    [4, checks],
  ]).state;

  return play(
    toRiver,
    river === "raised"
      ? [
          [3, raisesTo(100)],
          [4, raisesTo(300)],
          [3, calls],
        ]
      : [
          [3, checks],
          [4, checks],
        ]
  );
};

const shown = (index: number, hole: string) =>
  ShowdownEntries.Shown({
    cards: cards(hole),
    rank: evaluate(cards(`${hole} ${RIVER_BOARD}`)),
    seat: seat(index),
  });

const mucked = (index: number) => ShowdownEntries.Mucked({ seat: seat(index) });

const showdownOf = (events: readonly Event[]) =>
  events.filter((event) => Events.$is("ShowdownReached")(event));

describe("showdown edges (rules 23 to 25)", () => {
  it("Rules 23 and 24: after a river raise the raiser shows first; over three pots each seat shows for a pot it can still win and the worst hand mucks", () => {
    const hand = threePots("5c 4d", "raised");

    expect(showdownOf(hand.events)).toStrictEqual([
      Events.ShowdownReached({
        order: [
          shown(4, "Qs Qc"),
          shown(1, "As Ac"),
          shown(2, "Ks Kc"),
          mucked(3),
        ],
        run: 1,
      }),
    ]);
    expect(potsOf(hand.events)).toStrictEqual([
      pot(160, [1, 2, 3, 4], 1, [[1, 160]]),
      pot(240, [2, 3, 4], 2, [[2, 240]]),
      pot(600, [3, 4], 3, [[4, 600]]),
    ]);
    expect(stacksOf(hand.state).slice(0, 5)).toStrictEqual([
      1000, 160, 240, 580, 1180,
    ]);
  });

  it("Rules 24 and 25: a hand that only ties the shown hand for the top side pot shows and splits it", () => {
    const hand = threePots("Qd Qh", "raised");

    expect(showdownOf(hand.events)).toStrictEqual([
      Events.ShowdownReached({
        order: [
          shown(4, "Qs Qc"),
          shown(1, "As Ac"),
          shown(2, "Ks Kc"),
          shown(3, "Qd Qh"),
        ],
        run: 1,
      }),
    ]);
    expect(potsOf(hand.events).at(-1)).toStrictEqual(
      pot(600, [3, 4], 3, [
        [3, 300],
        [4, 300],
      ])
    );
    expect(stacksOf(hand.state).slice(0, 5)).toStrictEqual([
      1000, 160, 240, 880, 880,
    ]);
  });

  it("Rule 23: a checked river starts with the short all-in after the button, and both seats beaten in every pot they could win muck", () => {
    const hand = threePots("5c 4d", "checked");

    expect(showdownOf(hand.events)).toStrictEqual([
      Events.ShowdownReached({
        order: [shown(1, "As Ac"), shown(2, "Ks Kc"), mucked(3), mucked(4)],
        run: 1,
      }),
    ]);
    expect(potsOf(hand.events)).toStrictEqual([
      pot(160, [1, 2, 3, 4], 1, [[1, 160]]),
      pot(240, [2, 3, 4], 2, [[2, 240]]),
    ]);
  });
});
