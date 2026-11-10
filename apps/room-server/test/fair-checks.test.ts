import { describe, expect, it } from "@effect/vitest";
import { SeatIndexSchema } from "@nostakes/engine";
import { SeqSchema } from "@nostakes/protocol";
import {
  emptyWitness,
  MillisSchema,
  SeenEventSchema,
  witnessEvent,
} from "@nostakes/room";
import {
  BeaconRoundSchema,
  DigestSchema,
  EpochMillisSchema,
  roundTime,
  SealArrivals,
} from "@nostakes/shuffle";
import { Option } from "effect";

import { stretchesFrom, undealtSeals } from "./fixtures/fair-checks.js";
import { ana, openPokerHost } from "./fixtures/poker-host.js";
import { pokerCodec } from "./fixtures/poker-socket.js";
import type { Arrival } from "./fixtures/poker-socket.js";
import { TEST_CHAIN } from "./fixtures/test-beacon.js";

const ROUND = BeaconRoundSchema.make(101_520_000);

const DUE = roundTime(TEST_CHAIN, ROUND);

const SEALED_AT = DUE - 4000;

const sealFor = (hand: number, round: number) =>
  SeenEventSchema.cases.HandSealed.make({
    at: MillisSchema.make(SEALED_AT),
    hand,
    roots: [
      DigestSchema.make(new Uint8Array(32).fill(hand)),
      DigestSchema.make(new Uint8Array(32).fill(hand + 1)),
    ],
    round: BeaconRoundSchema.make(round),
    seats: [SeatIndexSchema.make(0), SeatIndexSchema.make(3)],
  });

const sealedWitness = witnessEvent(
  emptyWitness,
  sealFor(7, ROUND),
  SealArrivals.Live({ at: EpochMillisSchema.make(SEALED_AT + 50) })
);

const greeting = () => {
  const room = openPokerHost({ avatar: "fox", name: "Ana" });
  const frame = room.decodeFrame(room.welcome(ana, Option.none(), 1000));

  if (!pokerCodec.server.guards.Welcome(frame)) {
    throw new Error(`expected a welcome, got ${frame._tag}`);
  }

  return frame;
};

const deviceHearing = (skipsAfterTheSeal: boolean): readonly Arrival[] => {
  const welcome = greeting();
  const after = (offset: number) => SeqSchema.make(welcome.seq + offset);

  const batch = (offset: number, hand: number, round: number) =>
    pokerCodec.server.cases.Events.make({
      events: [sealFor(hand, round)],
      from: after(offset),
      to: after(offset),
      view: welcome.view,
    });

  const rejoined = {
    ...welcome,
    catchUp: pokerCodec.catchUp.cases.Skipped.make({
      from: after(2),
      to: after(60),
    }),
    seq: after(60),
  };

  return [
    { at: SEALED_AT - 1000, message: welcome, text: "" },
    { at: SEALED_AT + 50, message: batch(1, 7, ROUND), text: "" },
    ...(skipsAfterTheSeal
      ? [{ at: DUE + 20_000, message: rejoined, text: "" }]
      : []),
    {
      at: DUE + 30_000,
      message: batch(skipsAfterTheSeal ? 61 : 2, 8, ROUND + 100),
      text: "",
    },
  ];
};

const withdrawals = (stretches: Parameters<typeof undealtSeals>[0]) =>
  undealtSeals(stretches).map((problem) => problem.withdrawal);

describe("judging a sealed hand a device never saw dealt", () => {
  it("names a seal the device watched past the server's last moment to deal it", () => {
    expect(
      withdrawals([{ lastHeardAt: DUE + 20_000, witness: sealedWitness }])
    ).toStrictEqual(["never"]);
  });

  it("says nothing of a seal whose device stopped hearing the room before that moment", () => {
    expect(
      withdrawals([{ lastHeardAt: DUE + 5000, witness: sealedWitness }])
    ).toStrictEqual([]);
  });

  it("names a seal from the frames of a device that kept hearing the room past that moment", () => {
    expect(
      undealtSeals(stretchesFrom(deviceHearing(false))).map(
        (problem) => problem.withdrawal
      )
    ).toStrictEqual(["never"]);
  });

  it("says nothing of a seal when the device came back with a skipped catch-up after it, from the frames alone", () => {
    expect(
      undealtSeals(stretchesFrom(deviceHearing(true))).map(
        (problem) => problem.withdrawal
      )
    ).toStrictEqual([]);
  });

  it("says nothing of a seal whose deal fell in a range the device skipped, even when it listened long after", () => {
    expect(
      withdrawals([
        { lastHeardAt: DUE - 1000, witness: sealedWitness },
        { lastHeardAt: DUE + 60_000, witness: sealedWitness },
      ])
    ).toStrictEqual([]);
  });
});
