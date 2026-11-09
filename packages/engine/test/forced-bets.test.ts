import { describe, expect, it } from "@effect/vitest";
import { Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  Antes,
  Commands,
  Events,
  HandInProgress,
  NotEnoughPlayers,
  Phases,
  StraddleNotAllowed,
  decide,
} from "../src/index.js";
import type { Event, Hand, TableConfig } from "../src/index.js";
import {
  baseConfig,
  cards,
  chipCount,
  deckStartingWith,
  handOf,
  occupiedTable,
  rejection,
  run,
  seat,
  stacksOf,
  startHand,
} from "./fixtures.js";

const deck = deckStartingWith("Ac Kc Qc Jc Tc 9c 8c 7c 6c 5c 4c 3c 2c");

const bettingOf = (hand: Hand) => {
  if (!Phases.$is("Betting")(hand.phase)) {
    throw new Error(`expected betting, found ${hand.phase._tag}`);
  }

  return hand.phase;
};

const straddleRules = (underTheGun: number, button: boolean): TableConfig => ({
  ...baseConfig,
  straddle: { button, underTheGun },
});

const FIVE_STACKS = { 0: 500, 1: 500, 2: 500, 3: 500, 4: 500 };

const fiveHanded = (config: TableConfig) => occupiedTable(config, FIVE_STACKS);

const straddleRejection = (
  config: TableConfig,
  straddles: readonly number[],
  stacks: Readonly<Record<number, number>>
) =>
  rejection(
    occupiedTable(config, stacks),
    Commands.StartHand({
      deck,
      straddles: straddles.map((index) => seat(index)),
    })
  );

describe("starting a hand", () => {
  it("puts the first button on the first dealt-in seat, posts the blinds after it, and deals one card at a time from the seat after the button", () => {
    const table = occupiedTable(baseConfig, { 0: 200, 3: 200, 5: 200 });
    const started = startHand(table, deck);

    expect(started.events).toStrictEqual([
      Events.HandStarted({
        bigBlindSeat: seat(5),
        button: seat(0),
        dealtIn: [seat(0), seat(3), seat(5)],
        deck,
        handNumber: 1,
        smallBlindSeat: seat(3),
      }),
      Events.BlindPosted({
        allIn: false,
        amount: chipCount(5),
        blind: "Small",
        seat: seat(3),
      }),
      Events.BlindPosted({
        allIn: false,
        amount: chipCount(10),
        blind: "Big",
        seat: seat(5),
      }),
      Events.HoleCardsDealt({ cards: cards("Ac Jc"), seat: seat(3) }),
      Events.HoleCardsDealt({ cards: cards("Kc Tc"), seat: seat(5) }),
      Events.HoleCardsDealt({ cards: cards("Qc 9c"), seat: seat(0) }),
    ]);
    expect(stacksOf(started.state)).toStrictEqual([
      200,
      null,
      null,
      195,
      null,
      190,
      null,
      null,
      null,
    ]);
    expect(bettingOf(handOf(started.state))).toMatchObject({
      currentBet: 10,
      lastFullRaise: 10,
      toAct: seat(0),
    });
    expect(handOf(started.state).deck).toStrictEqual(deck.slice(6));
  });

  it("heads-up, the button posts the small blind and acts first before the flop (TDA Rule 34-B)", () => {
    const started = startHand(
      occupiedTable(baseConfig, { 2: 100, 7: 100 }),
      deck
    );

    expect(started.events.slice(1, 3)).toStrictEqual([
      Events.BlindPosted({
        allIn: false,
        amount: chipCount(5),
        blind: "Small",
        seat: seat(2),
      }),
      Events.BlindPosted({
        allIn: false,
        amount: chipCount(10),
        blind: "Big",
        seat: seat(7),
      }),
    ]);
    expect(bettingOf(handOf(started.state)).toAct).toBe(seat(2));
  });

  it("deals in only occupied seats that hold chips and are not sitting out", () => {
    const table = run(
      occupiedTable(baseConfig, { 1: 100, 4: 100 }),
      Commands.SetSittingOut({ seat: seat(4), sittingOut: true })
    ).state;

    expect(
      rejection(table, Commands.StartHand({ deck, straddles: [] }))
    ).toStrictEqual(new NotEnoughPlayers({ dealtIn: [seat(1)] }));
  });

  it("refuses a second deal while a hand is being played", () => {
    const started = startHand(
      occupiedTable(baseConfig, { 1: 100, 4: 100 }),
      deck
    );

    expect(
      rejection(started.state, Commands.StartHand({ deck, straddles: [] }))
    ).toStrictEqual(new HandInProgress({ handNumber: 1 }));
  });

  it("lets a short big blind post what it has while the bet to match stays the full big blind", () => {
    const started = startHand(
      occupiedTable(baseConfig, { 0: 100, 1: 100, 2: 4 }),
      deck
    );

    expect(started.events[2]).toStrictEqual(
      Events.BlindPosted({
        allIn: true,
        amount: chipCount(4),
        blind: "Big",
        seat: seat(2),
      })
    );
    expect(bettingOf(handOf(started.state))).toMatchObject({
      currentBet: 10,
      lastFullRaise: 10,
      toAct: seat(0),
    });
    expect(
      handOf(started.state).players.map((player) => player.status)
    ).toStrictEqual(["Active", "Active", "AllIn"]);
  });
});

describe("antes", () => {
  it("takes an every-player ante from each seat in deal order, keeps it out of the bet to match, and leaves a seat all in for the ante alone", () => {
    const config = {
      ...baseConfig,
      ante: Antes.EveryPlayer({ amount: chipCount(2) }),
    };

    const started = startHand(
      occupiedTable(config, { 0: 100, 1: 2, 4: 100 }),
      deck
    );

    expect(started.events.slice(1, 5)).toStrictEqual([
      Events.AntePosted({ allIn: true, amount: chipCount(2), seat: seat(1) }),
      Events.AntePosted({ allIn: false, amount: chipCount(2), seat: seat(4) }),
      Events.AntePosted({ allIn: false, amount: chipCount(2), seat: seat(0) }),
      Events.BlindPosted({
        allIn: false,
        amount: chipCount(10),
        blind: "Big",
        seat: seat(4),
      }),
    ]);

    const hand = handOf(started.state);

    expect(
      hand.players.map((player) => [
        player.seat,
        player.status,
        player.committedThisStreet,
        player.committedTotal,
      ])
    ).toStrictEqual([
      [0, "Active", 0, 2],
      [1, "AllIn", 0, 2],
      [4, "Active", 10, 12],
    ]);
    expect(bettingOf(hand)).toMatchObject({ currentBet: 10, toAct: seat(0) });
  });

  it("takes the big-blind ante as dead money and, for a short big blind, covers the blind first (TDA RP-11)", () => {
    const config = {
      ...baseConfig,
      ante: Antes.BigBlindPays({ amount: chipCount(3) }),
    };

    const started = startHand(
      occupiedTable(config, { 0: 100, 1: 100, 2: 12 }),
      deck
    );

    expect(started.events.slice(1, 4)).toStrictEqual([
      Events.AntePosted({ allIn: false, amount: chipCount(2), seat: seat(2) }),
      Events.BlindPosted({
        allIn: false,
        amount: chipCount(5),
        blind: "Small",
        seat: seat(1),
      }),
      Events.BlindPosted({
        allIn: true,
        amount: chipCount(10),
        blind: "Big",
        seat: seat(2),
      }),
    ]);

    const hand = handOf(started.state);

    expect(hand.deadMoney).toBe(2);
    expect(hand.players.map((player) => player.committedTotal)).toStrictEqual([
      0, 5, 10,
    ]);
    expect(stacksOf(started.state).slice(0, 3)).toStrictEqual([100, 95, 0]);
  });

  it("skips the big-blind ante when the big blind cannot cover its blind", () => {
    const config = {
      ...baseConfig,
      ante: Antes.BigBlindPays({ amount: chipCount(3) }),
    };

    const started = startHand(
      occupiedTable(config, { 0: 100, 1: 100, 2: 8 }),
      deck
    );

    expect(started.events.filter(Events.$is("AntePosted"))).toStrictEqual([]);
    expect(handOf(started.state).deadMoney).toBe(0);
  });
});

describe("straddles", () => {
  it("posts an under-the-gun straddle of twice the big blind, which sets the bet to match and the minimum raise, and action starts after it", () => {
    const started = startHand(fiveHanded(straddleRules(2, false)), deck, [3]);

    expect(started.events.filter(Events.$is("StraddlePosted"))).toStrictEqual([
      Events.StraddlePosted({ amount: chipCount(20), seat: seat(3) }),
    ]);
    expect(bettingOf(handOf(started.state))).toMatchObject({
      currentBet: 20,
      lastFullRaise: 20,
      toAct: seat(4),
    });
  });

  it("doubles each further straddle in an unbroken chain", () => {
    const started = startHand(
      fiveHanded(straddleRules(2, false)),
      deck,
      [3, 4]
    );

    expect(started.events.filter(Events.$is("StraddlePosted"))).toStrictEqual([
      Events.StraddlePosted({ amount: chipCount(20), seat: seat(3) }),
      Events.StraddlePosted({ amount: chipCount(40), seat: seat(4) }),
    ]);
    expect(bettingOf(handOf(started.state))).toMatchObject({
      currentBet: 40,
      lastFullRaise: 40,
      toAct: seat(0),
    });
  });

  it("starts action with the small blind after a button straddle", () => {
    const started = startHand(fiveHanded(straddleRules(0, true)), deck, [0]);

    expect(bettingOf(handOf(started.state)).toAct).toBe(seat(1));
  });

  it("rejects straddles that break the rules, and emits nothing", () => {
    expect(
      straddleRejection(straddleRules(2, true), [4], FIVE_STACKS)
    ).toStrictEqual(
      new StraddleNotAllowed({ reason: "OutOfTurn", straddles: [seat(4)] })
    );
    expect(
      straddleRejection(straddleRules(2, true), [3, 0], FIVE_STACKS)
    ).toStrictEqual(
      new StraddleNotAllowed({
        reason: "OutOfTurn",
        straddles: [seat(3), seat(0)],
      })
    );
    expect(
      straddleRejection(straddleRules(1, false), [3, 4], FIVE_STACKS)
    ).toStrictEqual(
      new StraddleNotAllowed({
        reason: "TooMany",
        straddles: [seat(3), seat(4)],
      })
    );
    expect(
      straddleRejection(straddleRules(0, true), [3], FIVE_STACKS)
    ).toStrictEqual(
      new StraddleNotAllowed({ reason: "UnderTheGunOff", straddles: [seat(3)] })
    );
    expect(
      straddleRejection(straddleRules(2, false), [0], FIVE_STACKS)
    ).toStrictEqual(
      new StraddleNotAllowed({
        reason: "ButtonStraddleOff",
        straddles: [seat(0)],
      })
    );
    expect(
      straddleRejection(straddleRules(2, true), [0], { 0: 500, 4: 500 })
    ).toStrictEqual(
      new StraddleNotAllowed({ reason: "HeadsUp", straddles: [seat(0)] })
    );
  });

  it("needs the straddler to hold more than the straddle after its ante", () => {
    const anted = {
      ...straddleRules(1, false),
      ante: Antes.EveryPlayer({ amount: chipCount(1) }),
    };

    expect(
      straddleRejection(straddleRules(1, false), [3], {
        0: 500,
        1: 500,
        2: 500,
        3: 20,
      })
    ).toStrictEqual(
      new StraddleNotAllowed({ reason: "CannotCover", straddles: [seat(3)] })
    );
    expect(
      straddleRejection(straddleRules(1, false), [3], {
        0: 500,
        1: 500,
        2: 500,
        3: 21,
      })
    ).toBeUndefined();
    expect(
      straddleRejection(anted, [3], { 0: 500, 1: 500, 2: 500, 3: 21 })
    ).toStrictEqual(
      new StraddleNotAllowed({ reason: "CannotCover", straddles: [seat(3)] })
    );
  });
});

const StraddleCaseSchema = Schema.Struct({
  anteKind: Schema.Literals(["NoAnte", "EveryPlayer", "BigBlindPays"]),
  button: Schema.Boolean,
  fromLine: Schema.Boolean,
  picks: Schema.Array(
    Schema.Int.check(Schema.isBetween({ maximum: 8, minimum: 0 }))
  ).check(Schema.isMaxLength(4)),
  stacks: Schema.Array(
    Schema.Int.check(Schema.isBetween({ maximum: 90, minimum: 0 }))
  ).check(Schema.isMinLength(9), Schema.isMaxLength(9)),
  underTheGun: Schema.Int.check(Schema.isBetween({ maximum: 3, minimum: 0 })),
});

type StraddleCase = typeof StraddleCaseSchema.Type;

const configOf = (example: StraddleCase): TableConfig => ({
  ...baseConfig,
  ante: {
    BigBlindPays: Antes.BigBlindPays({ amount: chipCount(3) }),
    EveryPlayer: Antes.EveryPlayer({ amount: chipCount(3) }),
    NoAnte: Antes.NoAnte(),
  }[example.anteKind],
  straddle: { button: example.button, underTheGun: example.underTheGun },
});

const ruleEight = (example: StraddleCase, straddles: readonly number[]) => {
  const dealtIn = example.stacks.flatMap((stack, index) =>
    stack > 0 ? [index] : []
  );

  const [button = 0] = dealtIn;

  const clockwiseAfter = (from: number) => [
    ...dealtIn.filter((index) => index > from),
    ...dealtIn.filter((index) => index <= from),
  ];

  const small =
    dealtIn.length === 2 ? button : (clockwiseAfter(button)[0] ?? 0);

  const big = clockwiseAfter(small)[0] ?? 0;
  const afterBig = clockwiseAfter(big);
  const line = afterBig.slice(0, afterBig.indexOf(button) + 1);
  const ante = example.anteKind === "EveryPlayer" ? 3 : 0;

  const chain =
    straddles.length <= example.underTheGun &&
    straddles.every((index, position) => line[position] === index);

  const buttonStraddle =
    example.button && straddles.length === 1 && straddles[0] === button;

  const covered = straddles.every(
    (index, position) =>
      (example.stacks[index] ?? 0) -
        Math.min(ante, example.stacks[index] ?? 0) >
      10 * 2 ** (position + 1)
  );

  return {
    holds:
      straddles.length === 0 ||
      (dealtIn.length > 2 && (chain || buttonStraddle) && covered),
    line,
  };
};

it.prop(
  "accepts a straddle list exactly when it is an unbroken under-the-gun chain or the button alone, never heads-up, each straddler covering twice the one before",
  {
    example: Arbitrary.schema(StraddleCaseSchema).pipe(
      Arbitrary.filter(
        (example) => example.stacks.filter((stack) => stack > 0).length >= 2
      )
    ),
  },
  ({ example }) => {
    const config = configOf(example);

    const stacks = Object.fromEntries(
      example.stacks.flatMap((stack, index) =>
        stack > 0 ? [[index, stack]] : []
      )
    );

    const { line } = ruleEight(example, []);

    const straddles = example.fromLine
      ? line.slice(0, example.picks.length)
      : example.picks;

    const decision = decide(
      occupiedTable(config, stacks),
      Commands.StartHand({
        deck,
        straddles: straddles.map((index) => seat(index)),
      })
    );

    const posted = Result.isSuccess(decision)
      ? decision.success.filter(Events.$is("StraddlePosted"))
      : [];

    expect(Result.isSuccess(decision)).toBe(
      ruleEight(example, straddles).holds
    );
    expect(
      posted.map((event: Event & { readonly seat: number }) => event.seat)
    ).toStrictEqual(Result.isSuccess(decision) ? straddles : []);
    expect(posted.map((event) => event.amount)).toStrictEqual(
      posted.map((_, position) => 10 * 2 ** (position + 1))
    );
  }
);
