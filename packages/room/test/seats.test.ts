import { describe, expect, it } from "@effect/vitest";
import { Seats } from "@nostakes/engine";
import { BoughtIn, CashedOut, AmountSchema } from "@nostakes/ledger";

import {
  AlreadySeated,
  BuyInOutOfRange,
  ChipRequestPending,
  ChipsOverMax,
  NoChipRequest,
  NoSeatRequest,
  NotSeated,
  NotTheHost,
  RoomCommands,
  RoomEvents,
  RoomStates,
  SeatNotFree,
  SeatRequestPending,
} from "../src/index.js";
import type { RoomState } from "../src/index.js";
import {
  ann,
  as,
  bob,
  cat,
  chipCount,
  ms,
  openedBy,
  rejection,
  run,
  runAll,
  seat,
  settings,
} from "./fixtures.js";

const open = (state: RoomState) => {
  if (!RoomStates.$is("Open")(state)) {
    throw new Error("expected an open room");
  }

  return state;
};

const join = (who: typeof ann) =>
  RoomCommands.Join({ at: ms(1), avatar: "", by: as(who), name: who });

const requestSeat = (who: typeof ann, index: number, buyIn: number) =>
  RoomCommands.RequestSeat({
    at: ms(2),
    buyIn: chipCount(buyIn),
    by: as(who),
    seat: seat(index),
  });

const approving = { ...settings, approval: { chips: true, seats: true } };

const guarded = runAll(openedBy(ann, approving), [join(bob), join(cat)]);

const chips = (who: typeof ann, count: number) =>
  RoomCommands.RequestChips({
    amount: chipCount(count),
    at: ms(4),
    by: as(who),
  });

const amount = (count: number) => AmountSchema.make(count);

describe("seats", () => {
  it("sits a member at once when seat approval is off, with the buy-in as stack and ledger entry", () => {
    const sat = run(
      runAll(openedBy(ann), [join(bob)]),
      requestSeat(bob, 4, 300)
    );

    expect(sat.events).toStrictEqual([
      RoomEvents.BoughtIn({
        amount: chipCount(300),
        at: ms(2),
        player: bob,
        seat: seat(4),
      }),
    ]);
    expect(open(sat.state).table.seats[4]).toStrictEqual(
      Seats.Occupied({ player: bob, sittingOut: false, stack: chipCount(300) })
    );
    expect(open(sat.state).entries.get(bob)).toStrictEqual([
      BoughtIn({ amount: amount(300), player: bob }),
    ]);
  });

  it("holds a request for the host when seat approval is on, but seats the host at once", () => {
    const asked = run(guarded, requestSeat(bob, 2, 200));

    expect(asked.events).toStrictEqual([
      RoomEvents.SeatRequested({
        at: ms(2),
        buyIn: chipCount(200),
        player: bob,
        seat: seat(2),
      }),
    ]);
    expect(open(asked.state).entries.size).toBe(0);
    expect(run(guarded, requestSeat(ann, 0, 200)).events).toStrictEqual([
      RoomEvents.BoughtIn({
        amount: chipCount(200),
        at: ms(2),
        player: ann,
        seat: seat(0),
      }),
    ]);
  });

  it("buys in on approval and records nothing on denial", () => {
    const asked = runAll(guarded, [
      requestSeat(bob, 2, 200),
      requestSeat(cat, 3, 400),
    ]);

    const approved = run(
      asked,
      RoomCommands.ApproveSeat({ at: ms(9), by: as(ann), player: bob })
    );

    expect(approved.events).toStrictEqual([
      RoomEvents.SeatApproved({ at: ms(9), player: bob }),
      RoomEvents.BoughtIn({
        amount: chipCount(200),
        at: ms(9),
        player: bob,
        seat: seat(2),
      }),
    ]);

    const denied = run(
      approved.state,
      RoomCommands.DenySeat({ at: ms(10), by: as(ann), player: cat })
    );

    expect(denied.events).toStrictEqual([
      RoomEvents.SeatDenied({ at: ms(10), player: cat }),
    ]);
    expect(open(denied.state).requests.seats).toStrictEqual([]);
    expect([...open(denied.state).entries.keys()]).toStrictEqual([bob]);
    expect(
      rejection(
        asked,
        RoomCommands.ApproveSeat({ at: ms(9), by: as(cat), player: bob })
      )
    ).toStrictEqual(new NotTheHost({ host: ann, player: cat }));
    expect(
      rejection(
        denied.state,
        RoomCommands.ApproveSeat({ at: ms(11), by: as(ann), player: cat })
      )
    ).toStrictEqual(new NoSeatRequest({ player: cat }));
  });

  it("refuses a taken or requested seat, a second seat, a second request, and a buy-in outside the range", () => {
    const asked = runAll(guarded, [
      requestSeat(ann, 0, 200),
      requestSeat(bob, 2, 200),
    ]);

    expect(rejection(asked, requestSeat(cat, 0, 200))).toStrictEqual(
      new SeatNotFree({ seat: seat(0) })
    );
    expect(rejection(asked, requestSeat(cat, 2, 200))).toStrictEqual(
      new SeatNotFree({ seat: seat(2) })
    );
    expect(rejection(asked, requestSeat(ann, 5, 200))).toStrictEqual(
      new AlreadySeated({ player: ann, seat: seat(0) })
    );
    expect(rejection(asked, requestSeat(bob, 5, 200))).toStrictEqual(
      new SeatRequestPending({ player: bob, seat: seat(2) })
    );
    expect(rejection(asked, requestSeat(cat, 5, 1001))).toStrictEqual(
      new BuyInOutOfRange({
        amount: chipCount(1001),
        max: chipCount(1000),
        min: chipCount(100),
      })
    );
  });

  it("adds approved chips up to the largest buy-in, and records them when they arrive", () => {
    const seated = runAll(guarded, [
      requestSeat(bob, 2, 200),
      RoomCommands.ApproveSeat({ at: ms(3), by: as(ann), player: bob }),
    ]);

    expect(rejection(seated, chips(cat, 100))).toStrictEqual(
      new NotSeated({ player: cat })
    );
    expect(rejection(seated, chips(bob, 801))).toStrictEqual(
      new ChipsOverMax({
        amount: chipCount(801),
        holding: chipCount(200),
        max: chipCount(1000),
        player: bob,
      })
    );

    const asked = run(seated, chips(bob, 800));

    expect(asked.events).toStrictEqual([
      RoomEvents.ChipsRequested({
        amount: chipCount(800),
        at: ms(4),
        player: bob,
      }),
    ]);
    expect(rejection(asked.state, chips(bob, 10))).toStrictEqual(
      new ChipRequestPending({ amount: chipCount(800), player: bob })
    );

    const approved = run(
      asked.state,
      RoomCommands.ApproveChips({ at: ms(5), by: as(ann), player: bob })
    );

    expect(approved.events).toStrictEqual([
      RoomEvents.ChipsApproved({ at: ms(5), player: bob }),
      RoomEvents.BoughtIn({
        amount: chipCount(800),
        at: ms(5),
        player: bob,
        seat: seat(2),
      }),
    ]);
    expect(open(approved.state).entries.get(bob)).toStrictEqual([
      BoughtIn({ amount: amount(200), player: bob }),
      BoughtIn({ amount: amount(800), player: bob }),
    ]);
    expect(
      rejection(
        approved.state,
        RoomCommands.DenyChips({ at: ms(6), by: as(ann), player: bob })
      )
    ).toStrictEqual(new NoChipRequest({ player: bob }));
  });

  it("cashes out a stack when its seat stands, by the player or by the host", () => {
    const seated = runAll(openedBy(ann), [
      join(bob),
      join(cat),
      requestSeat(bob, 2, 200),
      requestSeat(cat, 5, 300),
    ]);

    const left = run(
      seated,
      RoomCommands.LeaveSeat({ at: ms(7), by: as(bob) })
    );

    expect(left.events).toStrictEqual([
      RoomEvents.CashedOut({
        amount: chipCount(200),
        at: ms(7),
        player: bob,
        seat: seat(2),
      }),
    ]);
    expect(open(left.state).table.seats[2]).toStrictEqual(Seats.Empty());
    expect(open(left.state).entries.get(bob)).toStrictEqual([
      BoughtIn({ amount: amount(200), player: bob }),
      CashedOut({ amount: amount(200), player: bob }),
    ]);

    const removed = run(
      left.state,
      RoomCommands.RemoveFromSeat({ at: ms(8), by: as(ann), player: cat })
    );

    expect(removed.events).toStrictEqual([
      RoomEvents.CashedOut({
        amount: chipCount(300),
        at: ms(8),
        player: cat,
        seat: seat(5),
      }),
    ]);
    expect(
      rejection(
        removed.state,
        RoomCommands.RemoveFromSeat({ at: ms(9), by: as(bob), player: ann })
      )
    ).toStrictEqual(new NotTheHost({ host: ann, player: bob }));
  });

  it("stands a seated member who leaves the room, and passes the host role to the lowest seat", () => {
    const seated = runAll(openedBy(ann), [
      join(bob),
      join(cat),
      requestSeat(ann, 1, 200),
      requestSeat(cat, 3, 200),
      requestSeat(bob, 6, 200),
    ]);

    expect(
      run(seated, RoomCommands.LeaveRoom({ at: ms(9), by: as(ann) })).events
    ).toStrictEqual([
      RoomEvents.CashedOut({
        amount: chipCount(200),
        at: ms(9),
        player: ann,
        seat: seat(1),
      }),
      RoomEvents.HostChanged({ at: ms(9), host: cat }),
      RoomEvents.MemberLeft({ at: ms(9), player: ann }),
    ]);
  });
});
