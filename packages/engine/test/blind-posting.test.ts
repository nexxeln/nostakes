import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import {
  Antes,
  Commands,
  Events,
  NO_DEBT,
  Seats,
  StraddleNotAllowed,
  TableStates,
  legalActions,
} from "../src/index.js";
import type { Event, TableConfig, TableState } from "../src/index.js";
import {
  baseConfig,
  chipCount,
  deckStartingWith,
  folds,
  occupiedTable,
  player,
  rejection,
  run,
  runAll,
  seat,
  stacksOf,
  startHand,
} from "./fixtures.js";

const casino: TableConfig = { ...baseConfig, blindPosting: "Casino" };

const deck = deckStartingWith("2c 3c 4c 5c 6c 7c 8c 9c Tc Jc Qc Kc");

const foldedOut = (state: TableState) => {
  let current = state;

  for (let guard = 0; guard < 12; guard += 1) {
    const legal = legalActions(current);

    if (Option.isNone(legal)) {
      return current;
    }

    current = run(
      current,
      Commands.Act({ action: folds, seat: legal.value.seat })
    ).state;
  }

  return current;
};

const handOne = (config: TableConfig, seats: readonly number[]) =>
  foldedOut(
    startHand(
      occupiedTable(
        config,
        Object.fromEntries(seats.map((index) => [index, 200]))
      ),
      deck
    ).state
  );

const sit = (state: TableState, index: number) =>
  run(
    state,
    Commands.SitDown({
      buyIn: chipCount(200),
      player: player(`p${index}`),
      seat: seat(index),
    })
  ).state;

const sittingOut = (state: TableState, index: number, out: boolean) =>
  run(state, Commands.SetSittingOut({ seat: seat(index), sittingOut: out }))
    .state;

const started = (events: readonly Event[]) =>
  events.find(Events.$is("HandStarted"));

const owesAt = (state: TableState, index: number) => {
  const held = state.seats[index];

  return held !== undefined && Seats.$is("Occupied")(held)
    ? held.owes
    : NO_DEBT;
};

const nextHand = (state: TableState, posting: readonly number[] = []) =>
  run(
    state,
    Commands.StartHand({
      deck,
      posts: posting.map((index) => seat(index)),
      straddles: [],
    })
  );

const posted = (events: readonly Event[]) =>
  events.filter(
    (event) =>
      Events.$is("BlindPosted")(event) &&
      (event.dead === true || event.seat !== started(events)?.bigBlindSeat) &&
      event.seat !== started(events)?.smallBlindSeat
  );

describe("casino blinds for a new player", () => {
  it("owes nothing while the table has not dealt a hand yet", () => {
    expect(owesAt(occupiedTable(casino, { 0: 200, 2: 200, 4: 200 }), 4)).toBe(
      NO_DEBT
    );
  });

  it("waits until the big blind reaches the seat, then is dealt in as the big blind and owes nothing more", () => {
    const joined = sit(handOne(casino, [0, 2, 4]), 3);

    expect(owesAt(joined, 3)).toStrictEqual({ ...NO_DEBT, entry: true });

    const second = nextHand(joined);

    expect(started(second.events)).toMatchObject({
      bigBlindSeat: seat(0),
      button: seat(2),
      dealtIn: [seat(0), seat(2), seat(4)],
    });

    const third = nextHand(foldedOut(second.state));

    expect(started(third.events)?.dealtIn).toStrictEqual([
      seat(0),
      seat(2),
      seat(4),
    ]);

    const fourth = nextHand(foldedOut(third.state));

    expect(started(fourth.events)).toMatchObject({
      bigBlindSeat: seat(3),
      button: seat(0),
      dealtIn: [seat(0), seat(2), seat(3), seat(4)],
    });
    expect(posted(fourth.events)).toStrictEqual([]);
    expect(owesAt(fourth.state, 3)).toStrictEqual(NO_DEBT);
  });

  it("posts a live big blind to come in at once from a seat after the big blind", () => {
    const joined = sit(handOne(casino, [0, 2, 4, 6]), 7);
    const second = nextHand(joined, [7]);

    expect(started(second.events)).toMatchObject({
      bigBlindSeat: seat(6),
      dealtIn: [seat(0), seat(2), seat(4), seat(6), seat(7)],
    });
    expect(posted(second.events)).toStrictEqual([
      Events.BlindPosted({
        allIn: false,
        amount: chipCount(10),
        blind: "Big",
        seat: seat(7),
      }),
    ]);
    expect(legalActions(second.state)).toMatchObject(
      Option.some({ canCheck: true, seat: seat(7) })
    );
  });

  it("refuses a straddle from a seat posting to come in", () => {
    const joined = sit(
      handOne(
        { ...casino, straddle: { button: false, underTheGun: 2 } },
        [0, 2, 4, 6]
      ),
      7
    );

    expect(
      rejection(
        joined,
        Commands.StartHand({ deck, posts: [seat(7)], straddles: [seat(7)] })
      )
    ).toStrictEqual(
      new StraddleNotAllowed({ reason: "PostingToEnter", straddles: [seat(7)] })
    );
  });
});

const hands = (state: TableState, count: number) => {
  let current = state;

  for (let hand = 0; hand < count; hand += 1) {
    current = foldedOut(nextHand(current).state);
  }

  return current;
};

describe("casino blinds for a player who sits out", () => {
  it("owes both blinds once the big blind passes it, waits for the button to pass, and posts the big live and the small dead to come back", () => {
    const away = sittingOut(handOne(casino, [0, 2, 4, 6, 8]), 0, true);
    const missed = hands(away, 3);

    expect(owesAt(missed, 0)).toStrictEqual({
      ...NO_DEBT,
      big: true,
      small: true,
    });

    const back = sittingOut(missed, 0, false);
    const fifth = nextHand(back, [0]);

    expect(started(fifth.events)).toMatchObject({
      bigBlindSeat: seat(4),
      button: seat(8),
      dealtIn: [seat(2), seat(4), seat(6), seat(8)],
      smallBlindSeat: seat(2),
    });

    const sixth = nextHand(foldedOut(fifth.state), [0]);

    expect(started(sixth.events)).toMatchObject({
      bigBlindSeat: seat(6),
      button: seat(2),
      dealtIn: [seat(0), seat(2), seat(4), seat(6), seat(8)],
      smallBlindSeat: seat(4),
    });
    expect(posted(sixth.events)).toStrictEqual([
      Events.BlindPosted({
        allIn: false,
        amount: chipCount(10),
        blind: "Big",
        seat: seat(0),
      }),
      Events.BlindPosted({
        allIn: false,
        amount: chipCount(5),
        blind: "Small",
        dead: true,
        seat: seat(0),
      }),
    ]);
    expect(
      TableStates.$is("InHand")(sixth.state) && sixth.state.hand.deadMoney
    ).toBe(5);
    expect(owesAt(sixth.state, 0)).toStrictEqual(NO_DEBT);
  });

  it("owes only the small blind when it sits out on the small blind seat, which is dead that hand", () => {
    const away = sittingOut(handOne(casino, [0, 2, 4, 6]), 4, true);
    const second = nextHand(away);

    expect(started(second.events)).toMatchObject({
      bigBlindSeat: seat(6),
      button: seat(2),
      smallBlindSeat: seat(4),
    });
    expect(
      second.events
        .filter(Events.$is("BlindPosted"))
        .map((blind) => blind.blind)
    ).toStrictEqual(["Big"]);
    expect(owesAt(second.state, 4)).toStrictEqual({ ...NO_DEBT, small: true });
  });

  it("forgives every debt when fewer than two seats owe nothing, so the table still deals", () => {
    const away = sittingOut(handOne(casino, [0, 2, 4, 6]), 6, true);
    const missed = foldedOut(nextHand(away).state);

    expect(owesAt(missed, 6)).toStrictEqual({
      ...NO_DEBT,
      big: true,
      small: true,
    });

    const emptied = runAll(missed, [
      Commands.StandUp({ seat: seat(2) }),
      Commands.StandUp({ seat: seat(4) }),
      Commands.SetSittingOut({ seat: seat(6), sittingOut: false }),
    ]).state;

    const dealt = nextHand(emptied);

    expect(started(dealt.events)?.dealtIn).toStrictEqual([seat(0), seat(6)]);
    expect(posted(dealt.events)).toStrictEqual([]);
    expect(owesAt(dealt.state, 6)).toStrictEqual(NO_DEBT);
  });
});

describe("the casino dead button", () => {
  it("moves the big blind one seat when the big blind leaves, leaving a dead small blind and then a dead button", () => {
    const first = handOne(casino, [0, 2, 4, 6]);
    const left = run(first, Commands.StandUp({ seat: seat(4) })).state;
    const second = nextHand(left);

    expect(started(second.events)).toMatchObject({
      bigBlindSeat: seat(6),
      button: seat(2),
      smallBlindSeat: seat(4),
    });

    const third = nextHand(foldedOut(second.state));

    expect(started(third.events)).toMatchObject({
      bigBlindSeat: seat(0),
      button: seat(4),
      dealtIn: [seat(0), seat(2), seat(6)],
      smallBlindSeat: seat(6),
    });

    const home = nextHand(
      run(
        handOne(baseConfig, [0, 2, 4, 6]),
        Commands.StandUp({ seat: seat(4) })
      ).state
    );

    expect(started(home.events)).toMatchObject({
      bigBlindSeat: seat(0),
      button: seat(2),
      smallBlindSeat: seat(6),
    });
  });
});

describe("a dead small blind", () => {
  it("still awards the big blind's ante when everyone folds to the big blind", () => {
    const antes: TableConfig = {
      ...casino,
      ante: Antes.BigBlindPays({ amount: chipCount(1) }),
    };

    const left = run(
      handOne(antes, [0, 2, 4, 6]),
      Commands.StandUp({ seat: seat(4) })
    ).state;

    const before = stacksOf(left);
    const second = foldedOut(nextHand(left).state);

    expect(stacksOf(second)).toStrictEqual(before);
  });
});

describe("casino heads-up", () => {
  it("gives the button to the seat that had the big blind most recently when the table goes heads-up", () => {
    const first = handOne(casino, [0, 2, 4]);

    expect(stacksOf(first).slice(0, 5)).toStrictEqual([
      200,
      null,
      195,
      null,
      205,
    ]);

    const leaving = run(first, Commands.StandUp({ seat: seat(0) })).state;
    const headsUp = nextHand(leaving);

    expect(started(headsUp.events)).toMatchObject({
      bigBlindSeat: seat(2),
      button: seat(4),
      smallBlindSeat: seat(4),
    });

    const home = nextHand(
      run(handOne(baseConfig, [0, 2, 4]), Commands.StandUp({ seat: seat(0) }))
        .state
    );

    expect(started(home.events)).toMatchObject({
      bigBlindSeat: seat(4),
      button: seat(2),
    });
  });
});
