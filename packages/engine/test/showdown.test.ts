import { describe, expect, it } from "@effect/vitest";

import { Events, ShowdownEntries, evaluate } from "../src/index.js";
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
  raisesTo,
  seat,
  stacksOf,
  startHand,
} from "./fixtures.js";

const shown = (index: number, hole: string, board: string) =>
  ShowdownEntries.Shown({
    cards: cards(hole),
    rank: evaluate(cards(`${hole} ${board}`)),
    seat: seat(index),
  });

const mucked = (index: number) => ShowdownEntries.Mucked({ seat: seat(index) });

const THREE_HANDED_BOARD = "2h 7d 9c Jh Kd";

const threeHanded = () =>
  play(
    startHand(
      occupiedTable(baseConfig, { 0: 1000, 1: 1000, 2: 1000 }),
      deckStartingWith(`As Ks 4s Ac 3c 5s ${THREE_HANDED_BOARD}`)
    ).state,
    [
      [0, calls],
      [1, calls],
      [2, checks],
      [1, checks],
      [2, checks],
      [0, checks],
      [1, checks],
      [2, checks],
      [0, checks],
    ]
  ).state;

describe("showdown order", () => {
  it("has the last river aggressor show first, and a hand that cannot win mucks (TDA Rule 17-A)", () => {
    const river = play(threeHanded(), [
      [1, checks],
      [2, raisesTo(50)],
      [0, calls],
      [1, calls],
    ]);

    expect(river.events.slice(4)).toStrictEqual([
      Events.ShowdownReached({
        order: [
          shown(2, "Ks 3c", THREE_HANDED_BOARD),
          mucked(0),
          shown(1, "As Ac", THREE_HANDED_BOARD),
        ],
        run: 1,
      }),
      Events.PotAwarded({
        amount: chipCount(180),
        eligible: [seat(0), seat(1), seat(2)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(180), seat: seat(1) }],
      }),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(river.state).slice(0, 3)).toStrictEqual([940, 1120, 940]);
  });

  it("starts a checked-down showdown with the first seat clockwise from the button (TDA Rule 17-A)", () => {
    const river = play(threeHanded(), [
      [1, checks],
      [2, checks],
      [0, checks],
    ]);

    expect(river.events[3]).toStrictEqual(
      Events.ShowdownReached({
        order: [shown(1, "As Ac", THREE_HANDED_BOARD), mucked(2), mucked(0)],
        run: 1,
      })
    );
  });

  it("makes a seat that cannot beat the short all-in still show for the side pot it can win, and lets a worse seat muck", () => {
    const board = "2h 7d 9c Jh 3d";

    const river = play(
      startHand(
        occupiedTable(baseConfig, { 0: 1000, 1: 30, 2: 1000, 3: 1000 }),
        deckStartingWith(`As Ks Qs 4c Ac Kc Qc 5c ${board}`)
      ).state,
      [
        [3, calls],
        [0, folds],
        [1, raisesTo(30)],
        [2, calls],
        [3, calls],
        [2, raisesTo(100)],
        [3, calls],
        [2, checks],
        [3, checks],
        [2, checks],
        [3, checks],
      ]
    );

    expect(river.events.slice(-4)).toStrictEqual([
      Events.ShowdownReached({
        order: [shown(1, "As Ac", board), shown(2, "Ks Kc", board), mucked(3)],
        run: 1,
      }),
      Events.PotAwarded({
        amount: chipCount(90),
        eligible: [seat(1), seat(2), seat(3)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(90), seat: seat(1) }],
      }),
      Events.PotAwarded({
        amount: chipCount(200),
        eligible: [seat(2), seat(3)],
        pot: 2,
        run: 1,
        winners: [{ amount: chipCount(200), seat: seat(2) }],
      }),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(river.state).slice(0, 4)).toStrictEqual([
      1000, 90, 1070, 870,
    ]);
  });
});

describe("split pots", () => {
  it("splits a pot when the board plays and gives the odd chip to the first winner after the button (TDA Rule 20-A)", () => {
    const board = "As Ks Qs Js Ts";

    const river = play(
      startHand(
        occupiedTable(baseConfig, { 0: 100, 1: 100, 2: 100 }),
        deckStartingWith(`2c 3c 4c 5d 6d 7d ${board}`)
      ).state,
      [
        [0, calls],
        [1, folds],
        [2, checks],
        [2, checks],
        [0, checks],
        [2, checks],
        [0, checks],
        [2, checks],
        [0, checks],
      ]
    );

    expect(river.events.slice(-3)).toStrictEqual([
      Events.ShowdownReached({
        order: [shown(2, "3c 6d", board), shown(0, "4c 7d", board)],
        run: 1,
      }),
      Events.PotAwarded({
        amount: chipCount(25),
        eligible: [seat(0), seat(2)],
        pot: 1,
        run: 1,
        winners: [
          { amount: chipCount(13), seat: seat(2) },
          { amount: chipCount(12), seat: seat(0) },
        ],
      }),
      Events.HandEnded({ handNumber: 1 }),
    ]);
    expect(stacksOf(river.state).slice(0, 3)).toStrictEqual([102, 95, 103]);
  });
});
