import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import {
  Commands,
  Events,
  TableStates,
  legalActions,
} from "../../src/index.js";
import type { Action, Event, Street, TableState } from "../../src/index.js";
import {
  baseConfig,
  calls,
  cards,
  checks,
  chipCount,
  deckStartingWith,
  folds,
  occupiedTable,
  play,
  player,
  raisesTo,
  rejection,
  run,
  runCount,
  seat,
  stacksOf,
  startHand,
} from "../fixtures.js";

const deck = deckStartingWith("Ah Ad Kh Kd Qh Qd 2c 7d 9s Jc Tc 3h 4h");

const hunting = { ...baseConfig, rabbitHunt: true };

const toStreet = {
  Flop: [
    [0, calls],
    [1, calls],
    [2, checks],
  ],
  Preflop: [],
  River: [
    [0, calls],
    [1, calls],
    [2, checks],
    [1, checks],
    [2, checks],
    [0, checks],
    [1, checks],
    [2, checks],
    [0, checks],
  ],
  Turn: [
    [0, calls],
    [1, calls],
    [2, checks],
    [1, checks],
    [2, checks],
    [0, checks],
  ],
} satisfies Record<Street, readonly (readonly [number, Action])[]>;

const seatToAct = (state: TableState) =>
  Option.match(legalActions(state), {
    onNone: () => seat(0),
    onSome: (legal) => legal.seat,
  });

const foldOutOn = (street: Street) => {
  const reached = play(
    startHand(occupiedTable(hunting, { 0: 1000, 1: 1000, 2: 1000 }), deck)
      .state,
    toStreet[street]
  ).state;

  const bet = play(reached, [[seatToAct(reached), raisesTo(500)]]).state;
  const folder = seatToAct(bet);
  const oneFolded = play(bet, [[folder, folds]]).state;

  return {
    folder,
    state: play(oneFolded, [[seatToAct(oneFolded), folds]]).state,
  };
};

const huntOutcome = (state: TableState, index: number) =>
  rejection(state, Commands.RabbitHunt({ seat: seat(index) }))?._tag ??
  run(state, Commands.RabbitHunt({ seat: seat(index) })).events;

describe("after the hand (rules 26 and 27)", () => {
  it("Rule 27: a rabbit hunt after a fold-out shows the rest of the board on every street, once, and nothing after the river", () => {
    const streets: readonly Street[] = ["Preflop", "Flop", "Turn", "River"];

    const outcomes = streets.map((street) => {
      const { folder, state } = foldOutOn(street);

      return huntOutcome(state, folder);
    });

    expect(outcomes).toStrictEqual([
      [Events.RabbitHunted({ cards: cards("2c 7d 9s Jc Tc") })],
      [Events.RabbitHunted({ cards: cards("Jc Tc") })],
      [Events.RabbitHunted({ cards: cards("Tc") })],
      "NothingToHunt",
    ]);

    const { state } = foldOutOn("Flop");
    const hunted = run(state, Commands.RabbitHunt({ seat: seat(0) })).state;

    expect([huntOutcome(hunted, 1), huntOutcome(hunted, 0)]).toStrictEqual([
      "RabbitAlreadyHunted",
      "RabbitAlreadyHunted",
    ]);
  });

  it("Rule 26: shows and hunts belong to the player who held the cards, not the seat, and end at the next deal", () => {
    const ended = play(
      startHand(occupiedTable(hunting, { 0: 1000, 1: 1000, 2: 1000 }), deck)
        .state,
      [
        [0, folds],
        [1, folds],
      ]
    ).state;

    const stood = run(ended, Commands.StandUp({ seat: seat(0) })).state;

    const replaced = run(
      stood,
      Commands.SitDown({
        buyIn: chipCount(500),
        player: player("newcomer"),
        seat: seat(0),
      })
    ).state;

    const returned = run(
      stood,
      Commands.SitDown({
        buyIn: chipCount(500),
        player: player("p0"),
        seat: seat(0),
      })
    ).state;

    const showKing = Commands.ShowCards({ cards: cards("Kh"), seat: seat(0) });
    const hunt = Commands.RabbitHunt({ seat: seat(0) });

    expect([
      rejection(stood, showKing)?._tag,
      rejection(stood, hunt)?._tag,
      rejection(replaced, showKing)?._tag,
      rejection(replaced, hunt)?._tag,
    ]).toStrictEqual([
      "NotInLastHand",
      "NotInLastHand",
      "NotInLastHand",
      "NotInLastHand",
    ]);
    expect(run(returned, showKing).events).toStrictEqual([
      Events.CardsShown({ cards: cards("Kh"), seat: seat(0) }),
    ]);

    const nextDeal = startHand(ended, deckStartingWith("2s 3s 4s")).state;

    expect(
      rejection(
        nextDeal,
        Commands.ShowCards({ cards: cards("Ah"), seat: seat(1) })
      )?._tag
    ).toBe("NotInLastHand");
  });
});

const bustingHand = () =>
  play(
    startHand(occupiedTable(baseConfig, { 0: 1000, 1: 1000, 2: 50 }), deck)
      .state,
    [
      [0, calls],
      [1, calls],
      [2, raisesTo(50)],
      [0, calls],
      [1, folds],
    ]
  ).state;

const dealtInNext = (state: TableState) =>
  startHand(state, deckStartingWith("2s 3s 4s")).events.flatMap(
    (event: Event) => (Events.$is("HandStarted")(event) ? event.dealtIn : [])
  );

describe("seating during a hand (rules 3 and 28)", () => {
  it("Rule 3: a dealt-in seat that folded may not stand up or top up, the rules and the deal wait, and an empty seat may still be taken", () => {
    const folded = play(
      startHand(occupiedTable(baseConfig, { 0: 1000, 1: 1000, 2: 1000 }), deck)
        .state,
      [[0, folds]]
    ).state;

    const refusals = [
      Commands.StandUp({ seat: seat(0) }),
      Commands.AddChips({ amount: chipCount(5), seat: seat(0) }),
      Commands.ChangeRules({ config: { ...baseConfig, rabbitHunt: true } }),
      Commands.StartHand({ deck, straddles: [] }),
      Commands.ShowCards({ cards: cards("Kh"), seat: seat(0) }),
      Commands.ChooseRuns({ runs: runCount(1), seat: seat(1) }),
      Commands.Act({ action: checks, seat: seat(0) }),
    ].map((command) => rejection(folded, command)?._tag);

    expect(refusals).toStrictEqual([
      "SeatInHand",
      "SeatInHand",
      "HandInProgress",
      "HandInProgress",
      "NotInLastHand",
      "NoRunChoiceOwed",
      "NotYourTurn",
    ]);
    expect(
      run(
        folded,
        Commands.SitDown({
          buyIn: chipCount(300),
          player: player("late"),
          seat: seat(5),
        })
      ).events
    ).toStrictEqual([
      Events.PlayerSat({
        buyIn: chipCount(300),
        player: player("late"),
        seat: seat(5),
      }),
    ]);
  });

  it("Rule 3: sitting out mid-hand keeps the seat in this hand and drops it from the next deal", () => {
    const started = startHand(
      occupiedTable(baseConfig, { 0: 1000, 1: 1000, 2: 1000 }),
      deck
    ).state;

    const satOut = run(
      started,
      Commands.SetSittingOut({ seat: seat(1), sittingOut: true })
    ).state;

    expect(
      Option.map(legalActions(satOut), (legal) => legal.seat)
    ).toStrictEqual(Option.some(seat(0)));

    const finished = play(satOut, [
      [0, folds],
      [1, folds],
    ]).state;

    expect(dealtInNext(finished)).toStrictEqual([seat(0), seat(2)]);
  });

  it("Rule 28: a seat that busts stays seated with no chips, sits out of the next deal, and returns after a top-up", () => {
    const busted = bustingHand();

    expect(TableStates.$is("BetweenHands")(busted)).toBe(true);
    expect(stacksOf(busted).slice(0, 3)).toStrictEqual([1060, 990, 0]);
    expect(dealtInNext(busted)).toStrictEqual([seat(0), seat(1)]);

    const toppedUp = run(
      busted,
      Commands.AddChips({ amount: chipCount(40), seat: seat(2) })
    ).state;

    expect(dealtInNext(toppedUp)).toStrictEqual([seat(0), seat(1), seat(2)]);
  });
});
