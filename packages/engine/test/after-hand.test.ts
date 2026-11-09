import { describe, expect, it } from "@effect/vitest";

import {
  CardAlreadyPublic,
  CardNotHeld,
  Commands,
  Events,
  NotInLastHand,
  NothingToHunt,
  RabbitAlreadyHunted,
  RabbitHuntOff,
} from "../src/index.js";
import type { TableConfig } from "../src/index.js";
import {
  baseConfig,
  calls,
  card,
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
  runAll,
  seat,
  startHand,
} from "./fixtures.js";

const deck = deckStartingWith("Ac Kc Qc Jc Tc 9c 2d 3d 4d 5h 6h 7s 8s 9s");

const hunting: TableConfig = { ...baseConfig, rabbitHunt: true };

const shows = (index: number, text: string) =>
  Commands.ShowCards({ cards: cards(text), seat: seat(index) });

const hunts = (index: number) => Commands.RabbitHunt({ seat: seat(index) });

const walk = (config: TableConfig) =>
  play(
    startHand(occupiedTable(config, { 0: 200, 1: 200, 2: 200 }), deck).state,
    [
      [0, folds],
      [1, folds],
    ]
  ).state;

const foldedOnTheFlop = (config: TableConfig) =>
  play(
    startHand(occupiedTable(config, { 0: 200, 1: 200, 2: 200 }), deck).state,
    [
      [0, calls],
      [1, calls],
      [2, checks],
      [1, raisesTo(20)],
      [2, folds],
      [0, folds],
    ]
  ).state;

describe("voluntary shows", () => {
  it("lets the winner of a fold-out show one card", () => {
    expect(run(walk(baseConfig), shows(2, "Kc")).events).toStrictEqual([
      Events.CardsShown({ cards: cards("Kc"), seat: seat(2) }),
    ]);
  });

  it("lets a seat that folded show both cards", () => {
    expect(run(walk(baseConfig), shows(0, "Qc 9c")).events).toStrictEqual([
      Events.CardsShown({ cards: cards("Qc 9c"), seat: seat(0) }),
    ]);
  });

  it("lets a seat that mucked at showdown show a card, but not one already face up", () => {
    const board = "2h 7d 9c Jh Kd";

    const ended = play(
      startHand(
        occupiedTable(baseConfig, { 0: 1000, 1: 1000, 2: 1000 }),
        deckStartingWith(`As Ks 4s Ac 3c 5s ${board}`)
      ).state,
      [
        [0, calls],
        [1, calls],
        [2, checks],
        ...[1, 2, 0, 1, 2, 0].map((index) => [index, checks] as const),
        [1, checks],
        [2, raisesTo(50)],
        [0, calls],
        [1, calls],
      ]
    ).state;

    expect(run(ended, shows(0, "4s")).events).toStrictEqual([
      Events.CardsShown({ cards: cards("4s"), seat: seat(0) }),
    ]);
    expect(rejection(ended, shows(1, "As"))).toStrictEqual(
      new CardAlreadyPublic({ card: card("As"), seat: seat(1) })
    );
  });

  it("refuses a card the seat never held, a card shown twice, and a seat that was not in the last hand", () => {
    const shown = run(walk(baseConfig), shows(2, "Kc")).state;

    const replaced = runAll(walk(baseConfig), [
      Commands.StandUp({ seat: seat(2) }),
      Commands.SitDown({
        buyIn: chipCount(100),
        player: player("newcomer"),
        seat: seat(2),
      }),
    ]).state;

    expect(rejection(shown, shows(2, "Ac"))).toStrictEqual(
      new CardNotHeld({ card: card("Ac"), seat: seat(2) })
    );
    expect(rejection(shown, shows(2, "Kc"))).toStrictEqual(
      new CardAlreadyPublic({ card: card("Kc"), seat: seat(2) })
    );
    expect(rejection(replaced, shows(2, "Kc"))).toStrictEqual(
      new NotInLastHand({ seat: seat(2) })
    );
    expect(
      rejection(startHand(walk(baseConfig), deck).state, shows(2, "Kc"))
    ).toStrictEqual(new NotInLastHand({ seat: seat(2) }));
  });
});

describe("rabbit hunting", () => {
  it("reveals the turn and river that would have come after a fold on the flop", () => {
    const hunted = run(foldedOnTheFlop(hunting), hunts(0));

    expect(hunted.events).toStrictEqual([
      Events.RabbitHunted({ cards: cards("5h 6h") }),
    ]);
    expect(rejection(hunted.state, hunts(2))).toStrictEqual(
      new RabbitAlreadyHunted({ seat: seat(2) })
    );
  });

  it("refuses a rabbit hunt when the table rule is off (TDA Rule 28 bans it outright)", () => {
    expect(rejection(foldedOnTheFlop(baseConfig), hunts(0))).toStrictEqual(
      new RabbitHuntOff({ seat: seat(0) })
    );
  });

  it("has nothing to hunt after the whole board was dealt", () => {
    const checkedDown = play(
      startHand(occupiedTable(hunting, { 0: 200, 1: 200 }), deck).state,
      [
        [0, calls],
        [1, checks],
        ...[1, 0, 1, 0, 1, 0].map((index) => [index, checks] as const),
      ]
    ).state;

    expect(rejection(checkedDown, hunts(0))).toStrictEqual(
      new NothingToHunt({ seat: seat(0) })
    );
  });
});
