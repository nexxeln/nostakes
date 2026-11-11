import { describe, expect, it } from "@effect/vitest";
import { Events, SeatIndexSchema } from "@nostakes/engine";
import { PlayerIdSchema } from "@nostakes/protocol";
import {
  ChipAmountSchema,
  RoomEvents,
  RoomStates,
  millis,
  replay,
  standingsOf,
} from "@nostakes/room";
import type { RoomEvent } from "@nostakes/room";
import { Order } from "effect";

import {
  DEFAULT_SETTINGS,
  MemberCommandSchema,
  pokerRoom,
} from "../src/poker-room.js";
import type { MemberCommand } from "../src/poker-room.js";
import {
  ledgerFromLog,
  standingsProblems,
  unfinishedHand,
} from "./fixtures/halted-standings.js";
import { ana, ben, cy, openPokerHost } from "./fixtures/poker-host.js";
import { pokerCodec } from "./fixtures/poker-socket.js";

const Commands = MemberCommandSchema.cases;

const dan = PlayerIdSchema.make("dan-dddddddddddd");

const eve = PlayerIdSchema.make("eve-eeeeeeeeeeee");

const sit = (seat: number, buyIn: number): MemberCommand =>
  Commands.RequestSeat.make({
    buyIn: ChipAmountSchema.make(buyIn),
    seat: SeatIndexSchema.make(seat),
  });

const settledRows = (events: readonly RoomEvent[]) => {
  const [opened, ...rest] = events;

  if (opened === undefined || !RoomEvents.$is("RoomOpened")(opened)) {
    return [];
  }

  const stood = standingsOf(replay([opened, ...rest]), millis(60_000));

  return RoomStates.$is("Closed")(stood)
    ? stood.settlement.balances
        .map(({ boughtIn, cashedOut, net, player }) => ({
          boughtIn,
          cashedOut,
          net,
          player,
        }))
        .toSorted(Order.mapInput(Order.String, ({ player }) => player))
    : [];
};

const nightWithMovesOffTheHand = () => {
  const room = openPokerHost({
    avatar: "fox",
    name: "Ana",
    settings: { ...DEFAULT_SETTINGS, shuffle: "Plain" },
  });

  room.join(ben, 1001, "Ben");
  room.join(cy, 1002, "Cy");
  room.join(eve, 1002, "Eve");
  room.send(ana, "sit", 1003, sit(0, 100));
  room.send(ben, "sit", 1004, sit(1, 100));
  room.send(cy, "sit", 1005, sit(2, 150));
  room.send(cy, "out", 1006, Commands.SitOut.make({}));
  room.send(eve, "sit", 1006, sit(4, 100));
  room.send(eve, "out", 1006, Commands.SitOut.make({}));
  room.send(ana, "start", 1007, Commands.StartGame.make({}));
  room.runDue(1007);
  room.join(dan, 1008, "Dan");
  room.send(dan, "sit", 1009, sit(3, 60));
  room.send(cy, "leave", 1010, Commands.LeaveSeat.make({}));
  room.send(
    eve,
    "top up",
    1011,
    Commands.RequestChips.make({ amount: ChipAmountSchema.make(50) })
  );

  const events = room.memory
    .tables()
    .events.map(({ event }) => pokerCodec.decodeEvent(event));

  return events;
};

describe("the ledger a halted night is checked against", () => {
  it("counts the chips that move at seats left out of the unfinished hand: a cash-out from a player who sat it out, a top-up from one still sitting it out, and a buy-in from one who sat down after the deal", () => {
    const events = nightWithMovesOffTheHand();

    const ledger = ledgerFromLog(events);

    const afterDeal = events.slice(
      events.findIndex(
        (event) =>
          RoomEvents.$is("Table")(event) &&
          Events.$is("HandStarted")(event.event)
      )
    );

    expect({
      boughtInAfterDeal: afterDeal.filter(RoomEvents.$is("BoughtIn")).length,
      cashedOutAfterDeal: afterDeal.filter(RoomEvents.$is("CashedOut")).length,
      paidOut: ledger.reduce((sum, row) => sum + row.cashedOut, 0),
      unfinished: unfinishedHand(events),
    }).toStrictEqual({
      boughtInAfterDeal: 2,
      cashedOutAfterDeal: 1,
      paidOut: 560,
      unfinished: true,
    });
    expect(ledger).toStrictEqual(settledRows(events));
  });

  it("names only the players whose entries differ, with both values and the sound sequence number on each side", () => {
    const events = nightWithMovesOffTheHand();
    const [opened, ...rest] = events;
    const ledger = ledgerFromLog(events);

    const view =
      opened !== undefined && RoomEvents.$is("RoomOpened")(opened)
        ? [
            pokerRoom.haltedView(
              replay([opened, ...rest]),
              pokerRoom.audienceOf(replay([opened, ...rest]), ana),
              60_000
            ),
          ]
        : [];

    const skewed = ledger.map((row) =>
      row.player === cy
        ? { ...row, cashedOut: row.cashedOut - 5, net: row.net - 5 }
        : row
    );

    expect(
      view.flatMap((halted) =>
        standingsProblems(halted, skewed, { ledger: 17, standings: 18 })
      )
    ).toStrictEqual([
      "the server settled at sound seq 18 and the log's ledger at 17",
      `${cy}: in 150, left with 150, net 0 in the standings at sound seq 18, in 150, left with 145, net -5 in the log's ledger at sound seq 17`,
    ]);
  });
});
