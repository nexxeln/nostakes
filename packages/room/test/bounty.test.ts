import { describe, expect, it } from "@effect/vitest";
import {
  Actions,
  ChipsSchema,
  Events,
  Seats,
  SevenDeuces,
  TableConfigSchema,
} from "@nostakes/engine";
import type { Action } from "@nostakes/engine";
import { Effect, Option } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  Audiences,
  Deadlines,
  RoomCommands,
  RoomEvents,
  RoomStates,
  RoomViews,
  redact,
  viewFor,
} from "../src/index.js";
import type { RoomEvent, RoomSettings, RoomState } from "../src/index.js";
import {
  ann,
  as,
  bob,
  bytesForDeck,
  cat,
  chipCount,
  join,
  ms,
  openOf,
  openedBy,
  run,
  runAll,
  seat,
  server,
  settings,
  sit,
} from "./fixtures.js";
import {
  EMPTY_LEDGER,
  followed,
  netProblems,
  stackProblems,
} from "./log-ledger.js";
import { generated, sized } from "./scale.js";
import { playSession, session } from "./sessions.js";

const BOUNTY = 30;

const withBounty: RoomSettings = {
  ...settings,
  table: TableConfigSchema.make({
    ...settings.table,
    sevenDeuce: SevenDeuces.Bounty({ amount: chipCount(BOUNTY) }),
  }),
};

const act = (who: typeof ann, action: Action, at = 20) =>
  RoomCommands.Act({ action, at: ms(at), by: as(who) });

const tags = (events: readonly RoomEvent[]) =>
  events.map((event) =>
    RoomEvents.$is("Table")(event) ? event.event._tag : event._tag
  );

const dealt = (deck: string, chosen: RoomSettings = withBounty) =>
  runAll(openedBy(ann, chosen), [
    join(bob),
    join(cat),
    sit(ann, 0),
    sit(bob, 1),
    sit(cat, 2),
    RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
    RoomCommands.Deal({
      at: ms(10),
      by: server,
      shuffleBytes: bytesForDeck(deck),
    }),
  ]);

const CAT_HOLDS_IT = "Ac 7h Kc Ad 2c Kd";

const ANN_HOLDS_IT = "Ac Kc 7h Ad Kd 2c";

const paid = (collector: number, payers: Readonly<Record<number, number>>) =>
  RoomEvents.Table({
    at: ms(20),
    event: Events.BountyPaid({
      payers: Object.entries(payers).map(([index, amount]) => ({
        amount: chipCount(amount),
        seat: seat(Number(index)),
      })),
      seat: seat(collector),
    }),
  });

const stackOf = (state: RoomState, index: number) => {
  const occupant = openOf(state).table.seats[index];

  return occupant !== undefined && Seats.$is("Occupied")(occupant)
    ? occupant.stack
    : undefined;
};

describe("the seven-deuce bounty in a room", () => {
  it("is paid as the hand ends, shown to every audience, and kept in the last hand's view", () => {
    const folded = run(
      run(dealt(CAT_HOLDS_IT), act(ann, Actions.Fold())).state,
      act(bob, Actions.Fold())
    );

    expect(tags(folded.events)).toStrictEqual([
      "Folded",
      "UncalledBetReturned",
      "PotAwarded",
      "HandEnded",
      "CardsShown",
      "BountyPaid",
    ]);
    expect(folded.events.at(-1)).toStrictEqual(
      paid(2, { 0: BOUNTY, 1: BOUNTY })
    );
    expect(
      folded.events.map((event) => redact(event, Audiences.Spectator()))
    ).toStrictEqual(folded.events);
    expect(
      [0, 1, 2].map((index) => stackOf(folded.state, index))
    ).toStrictEqual([170, 165, 265]);

    const view = viewFor(
      folded.state,
      Audiences.Unseated({ player: bob }),
      ms(21)
    );

    expect(
      RoomViews.$is("Open")(view)
        ? view.lastHand.pipe(Option.flatMap((lastHand) => lastHand.bounty))
        : Option.none()
    ).toStrictEqual(
      Option.some({
        payers: [
          { amount: chipCount(BOUNTY), seat: seat(0) },
          { amount: chipCount(BOUNTY), seat: seat(1) },
        ],
        seat: seat(2),
      })
    );
  });

  it("takes the bounty from a seat that is leaving before that seat cashes out", () => {
    const leaving = run(
      dealt(CAT_HOLDS_IT),
      RoomCommands.LeaveSeat({ at: ms(15), by: as(ann) })
    );

    const ended = run(leaving.state, act(bob, Actions.Fold()));

    expect(tags(ended.events).slice(-4)).toStrictEqual([
      "HandEnded",
      "CardsShown",
      "BountyPaid",
      "CashedOut",
    ]);
    expect(ended.events.at(-1)).toStrictEqual(
      RoomEvents.CashedOut({
        amount: ChipsSchema.make(170),
        at: ms(20),
        player: ann,
        seat: seat(0),
      })
    );
    expect(stackOf(ended.state, 2)).toBe(265);
  });

  it("takes the bounty from a member the host removed during the hand before their seat cashes out", () => {
    const raised = run(
      dealt(ANN_HOLDS_IT),
      act(ann, Actions.RaiseTo({ to: chipCount(40) }))
    );

    const removed = run(
      raised.state,
      RoomCommands.RemoveMember({ at: ms(21), by: as(ann), player: bob })
    );

    const ended = run(removed.state, act(cat, Actions.Fold(), 22));
    const last = ended.events.at(-1);

    expect(tags(ended.events).slice(-4)).toStrictEqual([
      "HandEnded",
      "CardsShown",
      "BountyPaid",
      "CashedOut",
    ]);
    expect(
      last !== undefined && RoomEvents.$is("CashedOut")(last)
        ? [last.player, last.amount]
        : []
    ).toStrictEqual([bob, 165]);
    expect(stackOf(ended.state, 0)).toBe(200 + 5 + 10 + BOUNTY + BOUNTY);
    expect(stackOf(ended.state, 2)).toBe(200 - 10 - BOUNTY);
  });

  it("is paid from the chips on the table, before chips queued for the end of the hand arrive", () => {
    const short = runAll(openedBy(ann, withBounty), [
      join(bob),
      join(cat),
      sit(ann, 0),
      sit(bob, 1, 110),
      sit(cat, 2),
      RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
      RoomCommands.Deal({
        at: ms(10),
        by: server,
        shuffleBytes: bytesForDeck("Ac 7h Kc Ad 2c Kd 7d 7s 2d 9h Jh"),
      }),
      act(ann, Actions.Fold()),
      act(bob, Actions.RaiseTo({ to: chipCount(110) })),
      RoomCommands.RequestChips({
        amount: ChipsSchema.make(300),
        at: ms(20),
        by: as(bob),
      }),
    ]);

    const ended = run(short, act(cat, Actions.Call()));

    expect(tags(ended.events).slice(-3)).toStrictEqual([
      "HandEnded",
      "BountyPaid",
      "BoughtIn",
    ]);
    expect(ended.events.at(-2)).toStrictEqual(paid(2, { 0: BOUNTY }));
    expect(stackOf(ended.state, 1)).toBe(300);
  });

  it("pays nothing for a hand cancelled by ending a stalled night", () => {
    const stalled = run(
      dealt(CAT_HOLDS_IT),
      RoomCommands.NoteStall({
        at: ms(15),
        by: server,
        deadline: Deadlines.DealDue({ at: ms(15) }),
      })
    );

    const closed = run(
      stalled.state,
      RoomCommands.CloseRoom({ at: ms(16), by: as(bob) })
    );

    expect(tags(closed.events)).toContain("HandCancelled");
    expect(tags(closed.events)).not.toContain("BountyPaid");
    expect(
      RoomStates.$is("Closed")(closed.state)
        ? closed.state.settlement.balances.map((row) => Number(row.net))
        : []
    ).toStrictEqual([0, 0, 0]);
  });
});

const ledgerProblems = (
  source: typeof session extends Arbitrary.Arbitrary<infer A> ? A : never
) => {
  let ledger = EMPTY_LEDGER;
  const problems: string[] = [];
  let leaversPaid = 0;
  let lastBounty: readonly number[] = [];

  const played = playSession(source, (state, event) => {
    ledger = followed(ledger, event);

    if (RoomEvents.$is("Table")(event)) {
      lastBounty = Events.$is("BountyPaid")(event.event)
        ? event.event.payers.map((payer) => payer.seat)
        : [];
    } else if (RoomEvents.$is("CashedOut")(event)) {
      leaversPaid += lastBounty.includes(event.seat) ? 1 : 0;
    } else {
      lastBounty = [];
    }

    for (const problem of stackProblems(ledger, state)) {
      problems.push(`${event._tag}: ${problem}`);
    }
  });

  return {
    bounties: ledger.bounties,
    leaversPaid,
    problems: [
      ...problems,
      ...ledger.problems,
      ...netProblems(ledger, played.state),
    ],
  };
};

describe("generated rooms with the bounty", () => {
  it.prop(
    "chips: a ledger read from the log alone holds every stack after every event, no seat pays a bounty for a hand it was not dealt into or more than it holds, every cash-out is the stack the log left there, and every net in the settlement is what the hands and the bounties moved",
    { source: session },
    ({ source }) => {
      expect(ledgerProblems(source).problems).toStrictEqual([]);
    },
    generated(40, 100)
  );

  it.effect("reaches bounties, and bounties from seats on their way out", () =>
    Effect.gen(function* reachBounties() {
      const sources = yield* Arbitrary.sampleEffect(session, {
        count: sized(60, 150),
        seed: 20_261_111,
      });

      const outcomes = sources.map(ledgerProblems);

      expect(outcomes.flatMap((outcome) => outcome.problems)).toStrictEqual([]);

      let bounties = 0;
      let leaversPaid = 0;

      for (const outcome of outcomes) {
        bounties += outcome.bounties;
        leaversPaid += outcome.leaversPaid;
      }

      expect(bounties).toBeGreaterThan(sized(8, 30));
      expect(leaversPaid).toBeGreaterThan(sized(0, 2));
    })
  );
});
