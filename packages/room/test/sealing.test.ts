import { describe, expect, it } from "@effect/vitest";
import { Events, Seats, TableStates } from "@nostakes/engine";
import { selfSignedChain } from "@nostakes/shuffle";
import { Option, Schema } from "effect";

import {
  Actors,
  BeaconRejected,
  BeaconRoundWrong,
  DealNotDue,
  Deadlines,
  ProofDeals,
  RoomCommands,
  RoomEvents,
  SealRoundTooSoon,
  SealedDealSources,
  SeenEventSchema,
  audienceOf,
  nextDeadline,
  redact,
} from "../src/index.js";
import type { RoomEvent, RoomState } from "../src/index.js";
import { dealFromBeacon, sealAt } from "./beacon.js";
import {
  ann,
  as,
  bob,
  cat,
  dan,
  join,
  ms,
  openOf,
  openedBy,
  rejection,
  run,
  runAll,
  seat,
  settings,
  sit,
} from "./fixtures.js";

const checked = {
  ...settings,
  betweenHandsSeconds: 5,
  shuffle: "Checked" as const,
};

const START = 10_000;

const SEALED_ROUND = 6;

const ROUND_DUE = 15_000;

const seatedThree = runAll(openedBy(ann, checked), [
  join(bob),
  join(cat),
  join(dan),
  sit(ann, 0),
  sit(bob, 1),
  sit(cat, 2),
]);

const started = run(
  seatedThree,
  RoomCommands.StartGame({ at: ms(START), by: as(ann) })
).state;

const sealedStep = run(started, sealAt(START, 1));

const sealedEvent = (events: readonly RoomEvent[]) => {
  const found = events.find(RoomEvents.$is("HandSealed"));

  if (found === undefined) {
    throw new Error("expected a sealed hand");
  }

  return found;
};

const holeCardsOf = (events: readonly RoomEvent[]) =>
  events.flatMap((event) =>
    RoomEvents.$is("Table")(event) && Events.$is("HoleCardsDealt")(event.event)
      ? [event.event]
      : []
  );

const isInHand = (state: RoomState) =>
  TableStates.$is("InHand")(openOf(state).table);

const dealtSeats = (state: RoomState) => {
  const { table } = openOf(state);

  return TableStates.$is("InHand")(table)
    ? table.hand.players.map((player) => player.seat)
    : [];
};

describe("a checked room seals each hand", () => {
  it("seals at once when the game starts, naming the first round due 3.5 s on, in deal order from the button", () => {
    expect(nextDeadline(started)).toStrictEqual(
      Option.some(Deadlines.SealDue({ at: ms(START) }))
    );

    const sealed = sealedEvent(sealedStep.events);

    expect(sealed.round).toBe(SEALED_ROUND);
    expect(sealed.hand).toBe(1);
    expect(sealed.seats).toStrictEqual([seat(1), seat(2), seat(0)]);
  });

  it("deals only once the sealed round is due", () => {
    expect(nextDeadline(sealedStep.state)).toStrictEqual(
      Option.some(
        Deadlines.SealedDealDue({ at: ms(ROUND_DUE), round: SEALED_ROUND })
      )
    );

    expect(
      rejection(sealedStep.state, dealFromBeacon(ROUND_DUE - 1, SEALED_ROUND))
    ).toStrictEqual(
      new DealNotDue({ due: Option.some(ms(ROUND_DUE)), reason: "TooEarly" })
    );
  });

  it("deals every hole card from the sealed deck at the place the beacon round orders", () => {
    const dealt = run(
      sealedStep.state,
      dealFromBeacon(ROUND_DUE, SEALED_ROUND)
    );

    const sealed = sealedEvent(sealedStep.events);
    const opened = openOf(dealt.state);
    const proof = Option.getOrThrow(opened.proof);

    if (!ProofDeals.$is("FromBeacon")(proof.deal)) {
      throw new Error("expected a beacon deal");
    }

    const { plan } = proof.deal;
    const deck = sealed.decks[plan.dealtSlot];
    const dealtIn = sealed.seats.length;

    const expected = sealed.seats.map((dealtSeat, turn) => ({
      cards: [
        deck[plan.order[turn] ?? 0],
        deck[plan.order[dealtIn + turn] ?? 0],
      ],
      seat: dealtSeat,
    }));

    expect(
      holeCardsOf(dealt.events).map(({ cards, seat: at }) => ({
        cards,
        seat: at,
      }))
    ).toStrictEqual(expected);
    expect(dealt.events[0]?._tag).toBe("DealtFromBeacon");
  });

  it("refuses a beacon round other than the sealed one, and a signature made with another key", () => {
    expect(
      rejection(
        sealedStep.state,
        dealFromBeacon(ROUND_DUE + 3000, SEALED_ROUND + 1)
      )
    ).toStrictEqual(
      new BeaconRoundWrong({ given: SEALED_ROUND + 1, sealed: SEALED_ROUND })
    );

    const forged = RoomCommands.DealSealed({
      at: ms(ROUND_DUE),
      by: Actors.Server(),
      source: SealedDealSources.FromBeacon({
        round: SEALED_ROUND,
        signature: selfSignedChain("a key the server holds").sign(SEALED_ROUND),
      }),
    });

    expect(rejection(sealedStep.state, forged)).toStrictEqual(
      new BeaconRejected({
        reason: "BeaconSignatureInvalid",
        round: SEALED_ROUND,
      })
    );
  });

  it("refuses a seal that names a round which could be out before every player has the seal", () => {
    expect(
      rejection(started, sealAt(START, 1, SEALED_ROUND - 1))
    ).toStrictEqual(
      new SealRoundTooSoon({ earliest: SEALED_ROUND, round: SEALED_ROUND - 1 })
    );
  });

  it("refuses a plain deal while a hand is sealed", () => {
    expect(
      rejection(
        sealedStep.state,
        RoomCommands.Deal({
          at: ms(ROUND_DUE),
          by: Actors.Server(),
          shuffleBytes: new Uint8Array(256),
        })
      )
    ).toStrictEqual(new DealNotDue({ due: Option.none(), reason: "Sealed" }));
  });

  it("never shows anyone the sealed decks or the salt secret", () => {
    const sealed = sealedEvent(sealedStep.events);

    const seen = Schema.encodeSync(
      Schema.fromJsonString(Schema.toCodecJson(SeenEventSchema))
    )(redact(sealed, audienceOf(sealedStep.state, ann)));

    const decodeKeys = Schema.decodeUnknownSync(
      Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json))
    );

    expect(Object.keys(decodeKeys(seen)).toSorted()).toStrictEqual([
      "_tag",
      "at",
      "hand",
      "roots",
      "round",
      "seats",
    ]);
  });
});

describe("the seats a seal deals in", () => {
  it("wait a player who sits down after the seal for the next hand, then sit them in", () => {
    const joined = run(sealedStep.state, sit(dan, 3, 200, START + 100)).state;
    const dealt = run(joined, dealFromBeacon(ROUND_DUE, SEALED_ROUND)).state;

    expect(dealtSeats(dealt)).toStrictEqual([seat(0), seat(1), seat(2)]);
    expect(
      Option.exists(
        Option.fromUndefinedOr(openOf(dealt).table.seats[3]),
        (taken) => Seats.$is("Occupied")(taken) && !taken.sittingOut
      )
    ).toBe(true);
  });

  it("withdraw the seal and seal again when a sealed seat sits out while the seal may still be withdrawn", () => {
    const out = run(
      sealedStep.state,
      RoomCommands.SitOut({ at: ms(START + 100), by: as(cat) })
    );

    expect(out.events.at(-1)).toStrictEqual(
      RoomEvents.SealWithdrawn({
        at: ms(START + 100),
        hand: 1,
        reason: "SeatsChanged",
        round: SEALED_ROUND,
      })
    );
    expect(nextDeadline(out.state)).toStrictEqual(
      Option.some(Deadlines.SealDue({ at: ms(START + 100) }))
    );
  });

  it("deal a sealed seat that sits out once the seal binds, and leave it sitting out", () => {
    const late = START + 2000;

    const out = run(
      sealedStep.state,
      RoomCommands.SitOut({ at: ms(late), by: as(cat) })
    );

    expect(out.events.some(RoomEvents.$is("SealWithdrawn"))).toBe(false);

    const dealt = run(out.state, dealFromBeacon(ROUND_DUE, SEALED_ROUND)).state;

    expect(dealtSeats(dealt)).toStrictEqual([seat(0), seat(1), seat(2)]);
    expect(
      Option.exists(
        Option.fromUndefinedOr(openOf(dealt).table.seats[2]),
        (taken) => Seats.$is("Occupied")(taken) && taken.sittingOut
      )
    ).toBe(true);
  });

  it("keep a sealed seat that leaves once the seal binds until its hand ends, and stand one up at once before", () => {
    const late = run(
      sealedStep.state,
      RoomCommands.LeaveSeat({ at: ms(START + 2000), by: as(cat) })
    );

    expect(late.events).toStrictEqual([
      RoomEvents.LeaveQueued({ at: ms(START + 2000), player: cat }),
    ]);
    expect(
      isInHand(run(late.state, dealFromBeacon(ROUND_DUE, SEALED_ROUND)).state)
    ).toBe(true);

    const early = run(
      sealedStep.state,
      RoomCommands.LeaveSeat({ at: ms(START + 100), by: as(cat) })
    );

    expect(early.events.map((event) => event._tag)).toStrictEqual([
      "CashedOut",
      "SealWithdrawn",
    ]);
  });
});

describe("a sealed hand that will not be dealt", () => {
  it("is withdrawn when the game pauses in time, and dealt when the pause comes after the seal binds", () => {
    const early = run(
      sealedStep.state,
      RoomCommands.PauseGame({ at: ms(START + 100), by: as(ann) })
    );

    expect(early.events.map((event) => event._tag)).toStrictEqual([
      "GamePaused",
      "SealWithdrawn",
    ]);
    expect(nextDeadline(early.state)).toStrictEqual(Option.none());

    const late = run(
      sealedStep.state,
      RoomCommands.PauseGame({ at: ms(START + 2000), by: as(ann) })
    );

    expect(nextDeadline(late.state)).toStrictEqual(
      Option.some(
        Deadlines.SealedDealDue({ at: ms(ROUND_DUE), round: SEALED_ROUND })
      )
    );
  });

  it("is withdrawn before a room closes in time, and the close waits for the hand once the seal binds", () => {
    const early = run(
      sealedStep.state,
      RoomCommands.CloseRoom({ at: ms(START + 100), by: as(ann) })
    );

    expect(early.events[0]).toStrictEqual(
      RoomEvents.SealWithdrawn({
        at: ms(START + 100),
        hand: 1,
        reason: "RoomClosing",
        round: SEALED_ROUND,
      })
    );
    expect(early.events.at(-1)?._tag).toBe("RoomClosed");

    const late = run(
      sealedStep.state,
      RoomCommands.CloseRoom({ at: ms(START + 2000), by: as(ann) })
    );

    expect(late.events).toStrictEqual([
      RoomEvents.CloseQueued({ at: ms(START + 2000) }),
    ]);
  });
});
