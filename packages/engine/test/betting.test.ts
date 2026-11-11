import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import {
  Antes,
  Commands,
  Events,
  IllegalAction,
  PendingDecisions,
  pendingDecisions,
} from "../src/index.js";
import type { Event } from "../src/index.js";
import {
  actAs,
  baseConfig,
  calls,
  checks,
  chipCount,
  configWithBlinds,
  deckStartingWith,
  folds,
  legalOf,
  occupiedTable,
  play,
  raisesTo,
  rejection,
  runAll,
  runCount,
  seat,
  stacksOf,
  startHand,
} from "./fixtures.js";

const deck = deckStartingWith("Ac Kc Qc Jc Tc 9c 2d 3d 4d 5h 6h 7s 8s 9s");

const legal = (
  index: number,
  canCheck: boolean,
  call: number | null,
  raise: readonly [number, number] | null
) => ({
  call: call === null ? Option.none() : Option.some(chipCount(call)),
  canCheck,
  raise:
    raise === null
      ? Option.none()
      : Option.some({
          maxTo: chipCount(raise[1]),
          minTo: chipCount(raise[0]),
        }),
  seat: seat(index),
});

const tagsOf = (events: readonly Event[]) => events.map((event) => event._tag);

const potsOf = (events: readonly Event[]) =>
  events.filter((event) => Events.$is("PotAwarded")(event));

const RAN_OUT_ONCE = [
  "RunsAgreed",
  "HandsTabled",
  "StreetDealt",
  "StreetDealt",
  "StreetDealt",
  "ShowdownReached",
  "PotAwarded",
  "HandEnded",
];

describe("Rule 7 amended: a seat is asked to act only if another seat could respond or it owes chips someone put in", () => {
  it("heads-up, a big blind all in for 5 after a 9-chip ante leaves the button nothing to decide, so the board runs out (differential finding dead-decision-after-short-big-blind)", () => {
    const dealt = startHand(
      occupiedTable(
        {
          ...baseConfig,
          ante: Antes.EveryPlayer({ amount: chipCount(9) }),
          maxRuns: runCount(2),
        },
        { 1: 525, 2: 14 }
      ),
      deckStartingWith("5c 7s Ks 8d 9s 6d 2h Ts 4h")
    ).state;

    expect(pendingDecisions(dealt)).toStrictEqual(
      PendingDecisions.ChooseRuns({
        maxRuns: runCount(2),
        seats: [seat(1), seat(2)],
      })
    );

    const ran = runAll(dealt, [
      Commands.ChooseRuns({ runs: runCount(2), seat: seat(1) }),
      Commands.ChooseRuns({ runs: runCount(1), seat: seat(2) }),
    ]);

    expect(potsOf(ran.events)).toStrictEqual([
      Events.PotAwarded({
        amount: chipCount(28),
        eligible: [seat(1), seat(2)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(28), seat: seat(1) }],
      }),
    ]);
    expect(stacksOf(ran.state).slice(1, 3)).toStrictEqual([539, 0]);
  });

  it("multiway, rule 7 holds while another seat can respond, but once everyone folds to the small blind against a big blind all in for 4, the blind is not asked to act: its extra chip comes back and the board runs out", () => {
    const started = startHand(
      occupiedTable(baseConfig, { 0: 200, 1: 200, 2: 4, 3: 200 }),
      deckStartingWith("2c Ah Kc Qd 7d Ad Ks Qs 9h 6s 3c Jd 4s")
    ).state;

    expect(legalOf(started)).toStrictEqual(legal(3, false, 10, [20, 200]));

    const folded = play(started, [
      [3, folds],
      [0, folds],
    ]);

    expect(tagsOf(folded.events)).toStrictEqual([
      "Folded",
      "Folded",
      "UncalledBetReturned",
      ...RAN_OUT_ONCE,
    ]);
    expect([folded.events[2], ...potsOf(folded.events)]).toStrictEqual([
      Events.UncalledBetReturned({ amount: chipCount(1), seat: seat(1) }),
      Events.PotAwarded({
        amount: chipCount(8),
        eligible: [seat(1), seat(2)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(8), seat: seat(2) }],
      }),
    ]);
    expect(stacksOf(folded.state).slice(0, 4)).toStrictEqual([
      200, 196, 8, 200,
    ]);
  });

  it("heads-up, a big blind all in for 8 of 10 leaves the small blind a real call of 3, not 5, with no raise, and calling it runs the board out with nothing to return", () => {
    const started = startHand(
      occupiedTable(baseConfig, { 0: 200, 1: 8 }),
      deckStartingWith("2c Ah 7d Ad 9h 6s 3c Jd 4s")
    ).state;

    expect(legalOf(started)).toStrictEqual(legal(0, false, 3, null));

    const called = play(started, [[0, calls]]);

    expect(tagsOf(called.events)).toStrictEqual(["Called", ...RAN_OUT_ONCE]);
    expect([called.events[0], ...potsOf(called.events)]).toStrictEqual([
      Events.Called({ allIn: false, amount: chipCount(3), seat: seat(0) }),
      Events.PotAwarded({
        amount: chipCount(16),
        eligible: [seat(0), seat(1)],
        pot: 1,
        run: 1,
        winners: [{ amount: chipCount(16), seat: seat(0) }],
      }),
    ]);
    expect(stacksOf(called.state).slice(0, 2)).toStrictEqual([208, 0]);
  });
});

const tdaTable = (stacks: Readonly<Record<number, number>>) =>
  occupiedTable(configWithBlinds(50, 100), stacks);

const tdaFlop = () =>
  play(
    startHand(
      tdaTable({
        0: 10_000,
        1: 10_000,
        2: 225,
        3: 10_000,
        4: 300,
        5: 10_000,
      }),
      deck
    ).state,
    [
      [3, calls],
      [4, calls],
      [5, calls],
      [0, folds],
      [1, calls],
      [2, checks],
    ]
  ).state;

const tdaPreflopShove = () =>
  play(
    startHand(
      occupiedTable(configWithBlinds(2000, 4000), {
        0: 7500,
        1: 20_000,
        2: 20_000,
        3: 20_000,
        4: 20_000,
      }),
      deck
    ).state,
    [
      [3, calls],
      [4, folds],
      [0, raisesTo(7500)],
      [1, folds],
    ]
  );

const tdaShortAllIns = () =>
  play(tdaFlop(), [
    [1, raisesTo(100)],
    [2, raisesTo(125)],
    [3, calls],
    [4, raisesTo(200)],
    [5, calls],
  ]);

describe("reopening the betting (TDA Rule 47)", () => {
  it("reopens the betting when short all-ins add up to a full raise (TDA Rule 47, Example 1)", () => {
    expect(tdaShortAllIns().events.slice(1, 4)).toStrictEqual([
      Events.RaisedTo({
        added: chipCount(125),
        allIn: true,
        full: false,
        seat: seat(2),
        to: chipCount(125),
      }),
      Events.Called({ allIn: false, amount: chipCount(125), seat: seat(3) }),
      Events.RaisedTo({
        added: chipCount(200),
        allIn: true,
        full: false,
        seat: seat(4),
        to: chipCount(200),
      }),
    ]);
    expect(legalOf(tdaShortAllIns().state)).toStrictEqual(
      legal(1, false, 100, [300, 9900])
    );
  });

  it("does not reopen the betting for a seat facing less than a full raise (TDA Rule 47, Example 1-A)", () => {
    const smoothCall = play(tdaShortAllIns().state, [[1, calls]]);

    expect(legalOf(smoothCall.state)).toStrictEqual(legal(3, false, 75, null));
    expect(rejection(smoothCall.state, actAs(3, raisesTo(300)))).toStrictEqual(
      new IllegalAction({
        action: raisesTo(300),
        legal: legal(3, false, 75, null),
        seat: seat(3),
      })
    );
  });

  it("reopens the betting for that seat once it faces a full raise (TDA Rule 47, Example 1-B)", () => {
    const minRaise = play(tdaShortAllIns().state, [[1, raisesTo(300)]]);

    expect(legalOf(minRaise.state)).toStrictEqual(
      legal(3, false, 175, [400, 9900])
    );
  });

  it("keeps the minimum raise at the last full bet after several short all-ins (TDA Rule 47, Example 2)", () => {
    const sixWay = play(
      startHand(
        tdaTable({ 0: 10_000, 1: 10_000, 2: 600, 3: 750, 4: 900, 5: 10_000 }),
        deck
      ).state,
      [
        [3, calls],
        [4, calls],
        [5, calls],
        [0, calls],
        [1, calls],
        [2, checks],
        [1, raisesTo(300)],
        [2, raisesTo(500)],
        [3, raisesTo(650)],
        [4, raisesTo(800)],
        [5, calls],
      ]
    );

    expect(legalOf(sixWay.state)).toStrictEqual(
      legal(0, false, 800, [1100, 9900])
    );
  });

  it("lets the big blind, who has not acted, raise over a short all-in, while the limper may only call it (TDA Rule 47, Example 3-A)", () => {
    expect(legalOf(tdaPreflopShove().state)).toStrictEqual(
      legal(2, false, 3500, [11_500, 20_000])
    );

    const bigBlindCalls = play(tdaPreflopShove().state, [[2, calls]]);

    expect(legalOf(bigBlindCalls.state)).toStrictEqual(
      legal(3, false, 3500, null)
    );
  });

  it("reopens the betting for the limper after the big blind makes a full raise (TDA Rule 47, Example 3-B)", () => {
    const bigBlindRaises = play(tdaPreflopShove().state, [
      [2, raisesTo(11_500)],
    ]);

    expect(legalOf(bigBlindRaises.state)).toStrictEqual(
      legal(3, false, 7500, [15_500, 20_000])
    );
  });
});

describe("uncalled bets", () => {
  it("returns the part of a bet that no one could match before any pot is built", () => {
    const allIn = play(
      startHand(occupiedTable(baseConfig, { 0: 500, 1: 100 }), deck).state,
      [
        [0, raisesTo(500)],
        [1, calls],
      ]
    );

    expect(allIn.events.slice(0, 3)).toStrictEqual([
      Events.RaisedTo({
        added: chipCount(495),
        allIn: true,
        full: true,
        seat: seat(0),
        to: chipCount(500),
      }),
      Events.Called({ allIn: true, amount: chipCount(90), seat: seat(1) }),
      Events.UncalledBetReturned({ amount: chipCount(400), seat: seat(0) }),
    ]);
    expect(stacksOf(allIn.state).slice(0, 2)).toStrictEqual([400, 200]);
  });
});
