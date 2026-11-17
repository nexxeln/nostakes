import { describe, expect, it } from "@effect/vitest";
import { Match, Option } from "effect";

import {
  BettingLimits,
  Commands,
  PendingDecisions,
  Phases,
  Seats,
  TableStates,
  pendingDecisions,
} from "../src/index.js";
import type { Event, SeatIndex, TableState } from "../src/index.js";
import { generated } from "./scale.js";
import { playSession, session } from "./sessions.js";
import type { Session } from "./sessions.js";

interface Middle {
  readonly pot: number;
  readonly street: ReadonlyMap<SeatIndex, number>;
}

const EMPTY: Middle = { pot: 0, street: new Map() };

const putIn = (middle: Middle, seat: SeatIndex, amount: number): Middle => ({
  pot: middle.pot + amount,
  street: new Map([
    ...middle.street,
    [seat, (middle.street.get(seat) ?? 0) + amount],
  ]),
});

const after = (middle: Middle, event: Event): Middle =>
  Match.value(event).pipe(
    Match.tags({
      AntePosted: ({ amount }) => ({ ...middle, pot: middle.pot + amount }),
      BlindPosted: ({ amount, dead, seat }) =>
        dead === true
          ? { ...middle, pot: middle.pot + amount }
          : putIn(middle, seat, amount),
      Called: ({ amount, seat }) => putIn(middle, seat, amount),
      HandStarted: () => EMPTY,
      RaisedTo: ({ added, seat }) => putIn(middle, seat, added),
      StraddlePosted: ({ amount, seat }) => putIn(middle, seat, amount),
      StreetDealt: () => ({ ...middle, street: new Map() }),
      UncalledBetReturned: ({ amount, seat }) => ({
        pot: middle.pot - amount,
        street: new Map([
          ...middle.street,
          [seat, Math.max(0, (middle.street.get(seat) ?? 0) - amount)],
        ]),
      }),
    }),
    Match.orElse(() => middle)
  );

const stackAt = (state: TableState, seat: SeatIndex) => {
  const occupant = state.seats[seat];

  return occupant !== undefined && Seats.$is("Occupied")(occupant)
    ? occupant.stack
    : 0;
};

const currentBetIn = (state: TableState) =>
  TableStates.$is("InHand")(state) && Phases.$is("Betting")(state.hand.phase)
    ? Option.some(state.hand.phase.currentBet)
    : Option.none();

const capsIn = (source: Session) => {
  const played = playSession(source);
  let middle = EMPTY;

  const found: {
    readonly belowStack: boolean;
    readonly expected: number;
    readonly offered: number;
  }[] = [];

  for (const step of played.steps) {
    const decision = pendingDecisions(step.before);

    if (
      Commands.$is("Act")(step.command) &&
      PendingDecisions.$is("Bet")(decision)
    ) {
      const { legal } = decision;
      const currentBet = Option.getOrElse(currentBetIn(step.before), () => 0);
      const inFront = middle.street.get(legal.seat) ?? 0;
      const allInTo = inFront + stackAt(step.before, legal.seat);

      for (const range of Option.toArray(legal.raise)) {
        const potSized = currentBet + middle.pot + (currentBet - inFront);

        found.push({
          belowStack: potSized < allInTo,
          expected: BettingLimits.$is("PotLimit")(step.before.config.limit)
            ? Math.min(allInTo, Math.max(range.minTo, potSized))
            : allInTo,
          offered: range.maxTo,
        });
      }
    }

    for (const event of step.events) {
      middle = after(middle, event);
    }
  }

  return found;
};

describe("pot-limit betting", () => {
  it.prop(
    "the most a seat may raise to is the bet, plus every chip in the middle counted from the events, plus the call, or its whole stack when that is less; without a limit it is the whole stack",
    { source: session },
    ({ source }) => {
      for (const cap of capsIn(source)) {
        expect(cap.offered).toBe(cap.expected);
      }
    },
    generated(25, 100)
  );

  it("reaches capped raises below the stack in seeded sessions", () => {
    let capped = 0;

    for (const omaha of [false, true]) {
      for (let pick = 1; pick <= 20; pick += 1) {
        const source: Session = {
          anteAmount: 2,
          anteKind: pick % 3,
          bigBlindExtra: 5,
          bombAnte: pick % 2 === 0 ? 20 : 0,
          bombBoards: pick % 4 === 0 ? 2 : 1,
          bombEvery: 3,
          bounty: 0,
          button: true,
          casinoBlinds: pick % 2 === 1,
          fixedRuns: false,
          hiddenAllIns: false,
          intents: Array.from({ length: 400 }, (_, index) => ({
            pick: (index + 1) * 7919 * pick,
            roll: (index * 37 + pick) % 100,
          })),
          interactive: false,
          lastAggressorShows: false,
          maxRuns: 2,
          omaha,
          potLimit: true,
          rabbitHunt: false,
          rabbitStillIn: false,
          smallBlind: 5,
          stacks: [300, 280, 260, 240, 220, 200, 180, 160, 140],
          straddlesDouble: true,
          underTheGun: 1,
          voluntaryBoth: false,
        };

        for (const cap of capsIn(source)) {
          expect(cap.offered).toBe(cap.expected);
          capped += cap.belowStack ? 1 : 0;
        }
      }
    }

    expect(capped).toBeGreaterThan(200);
  });
});
