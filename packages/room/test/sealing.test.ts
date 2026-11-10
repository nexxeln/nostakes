import { describe, expect, it } from "@effect/vitest";
import {
  Actions,
  Events,
  PendingDecisions,
  Seats,
  TableStates,
  pendingDecisions,
} from "@nostakes/engine";
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
  RoomViews,
  redact,
  viewFor,
} from "../src/index.js";
import type { RoomEvent, RoomState } from "../src/index.js";
import { dealFromBeacon, sealAt, serverAnswer } from "./beacon.js";
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
  player,
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
    ? table.hand.players.map((dealt) => dealt.seat)
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

  it("keeps the dealt hand's proof out of the view while the hand is played, and shows it once the hand is over", () => {
    const dealt = run(
      sealedStep.state,
      dealFromBeacon(ROUND_DUE, SEALED_ROUND)
    );

    const during = viewFor(
      dealt.state,
      audienceOf(dealt.state, ann),
      ms(ROUND_DUE)
    );

    expect(
      RoomViews.$is("Open")(during) && Option.isNone(during.fairness.dealt)
    ).toBe(true);

    let folded = dealt.state;

    while (isInHand(folded)) {
      const pending = pendingDecisions(openOf(folded).table);

      if (!PendingDecisions.$is("Bet")(pending)) {
        break;
      }

      const actor = Option.getOrThrow(
        Option.fromUndefinedOr(
          openOf(folded).table.seats[pending.legal.seat]
        ).pipe(Option.filter(Seats.$is("Occupied")))
      ).player;

      folded = run(
        folded,
        RoomCommands.Act({
          action: pending.legal.canCheck ? Actions.Check() : Actions.Fold(),
          at: ms(ROUND_DUE + 1),
          by: as(actor),
        })
      ).state;
    }

    const after = viewFor(folded, audienceOf(folded, ann), ms(ROUND_DUE + 2));

    expect(
      RoomViews.$is("Open")(after) &&
        Option.exists(after.fairness.dealt, ({ seal }) => seal.hand === 1)
    ).toBe(true);
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

describe("a player who leaves once the seal binds, heads-up", () => {
  const twoSeated = run(
    runAll(openedBy(ann, checked), [join(bob), sit(ann, 0), sit(bob, 1)]),
    RoomCommands.StartGame({ at: ms(START), by: as(ann) })
  ).state;

  const sealed = run(twoSeated, sealAt(START, 1)).state;

  const button = Option.getOrThrow(
    Option.fromUndefinedOr(
      sealedEvent(run(twoSeated, sealAt(START, 1)).events).seats.at(-1)
    )
  );

  const leaver = Option.getOrThrow(
    Option.fromUndefinedOr(openOf(sealed).table.seats[button]).pipe(
      Option.filter(Seats.$is("Occupied"))
    )
  ).player;

  const left = run(
    sealed,
    RoomCommands.LeaveSeat({ at: ms(START + 2000), by: as(leaver) })
  ).state;

  const dealt = run(left, dealFromBeacon(ROUND_DUE, SEALED_ROUND));

  it("is dealt in and acted for, and stands only in a later batch, so the deal never changes who holds a seat", () => {
    expect(
      dealt.events.some(
        (event) =>
          RoomEvents.$is("Table")(event) && Events.$is("HandEnded")(event.event)
      )
    ).toBe(true);
    expect(dealt.events.some(RoomEvents.$is("CashedOut"))).toBe(false);
    expect(nextDeadline(dealt.state)).toStrictEqual(
      Option.some(Deadlines.QueueDue({ at: ms(ROUND_DUE) }))
    );

    const ran = run(
      dealt.state,
      RoomCommands.RunQueue({ at: ms(ROUND_DUE), by: Actors.Server() })
    );

    expect(
      ran.events
        .filter(RoomEvents.$is("CashedOut"))
        .map((event) => event.player)
    ).toStrictEqual([leaver]);
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

const eve = player("eve");

const foldOrAnswer = (state: RoomState, step: number): RoomState => {
  const open = openOf(state);
  const pending = pendingDecisions(open.table);

  if (PendingDecisions.$is("Bet")(pending)) {
    const held = open.table.seats[pending.legal.seat];

    return held !== undefined && Seats.$is("Occupied")(held)
      ? run(
          state,
          RoomCommands.Act({
            action: Actions.Fold(),
            at: open.now,
            by: as(held.player),
          })
        ).state
      : state;
  }

  return Option.match(nextDeadline(state), {
    onNone: () => state,
    onSome: (deadline) => run(state, serverAnswer(deadline, step)).state,
  });
};

const handsPlayed = (state: RoomState) => openOf(state).table.handNumber;

describe("a sealed deal at a casino table", () => {
  it("deals the sealed seats even when a posting player changes their mind after the seal", () => {
    const casino = {
      ...checked,
      table: { ...checked.table, blindPosting: "Casino" as const },
    };

    let state = runAll(openedBy(ann, casino), [
      join(bob),
      join(cat),
      join(dan),
      join(eve),
      sit(ann, 0),
      sit(bob, 1),
      sit(cat, 2),
      sit(eve, 3),
      RoomCommands.StartGame({ at: ms(START), by: as(ann) }),
    ]);

    for (let step = 0; step < 40 && handsPlayed(state) < 1; step += 1) {
      state = foldOrAnswer(state, step);
    }

    for (let step = 40; step < 80 && isInHand(state); step += 1) {
      state = foldOrAnswer(state, step);
    }

    const { now } = openOf(state);

    const posting = runAll(state, [
      sit(dan, 5, 200, now),
      RoomCommands.ChoosePosting({ at: ms(now), by: as(dan), post: true }),
    ]);

    const sealed = Option.match(nextDeadline(posting), {
      onNone: () => run(posting, sealAt(now, 99)),
      onSome: (deadline) => run(posting, serverAnswer(deadline, 99)),
    });

    expect(sealedEvent(sealed.events).seats).toContain(seat(5));

    const changed = run(
      sealed.state,
      RoomCommands.ChoosePosting({ at: ms(now + 1), by: as(dan), post: false })
    ).state;

    const dealt = Option.match(nextDeadline(changed), {
      onNone: () => changed,
      onSome: (deadline) => run(changed, serverAnswer(deadline, 100)).state,
    });

    expect(dealtSeats(dealt)).toContain(seat(5));
  });
});
