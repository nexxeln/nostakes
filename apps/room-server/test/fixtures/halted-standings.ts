import { Events, Seats } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/engine";
import { RoomEvents, RoomStates, RoomViews, replay } from "@nostakes/room";
import type { RoomEvent, RoomView } from "@nostakes/room";
import { Array as Arr, Order, Schema } from "effect";

import { pokerRoom } from "../../src/poker-room.js";
import { pokerCodec } from "./poker-socket.js";

export interface LedgerRow {
  readonly player: PlayerId;
  readonly boughtIn: number;
  readonly cashedOut: number;
  readonly net: number;
}

export const soundPrefixOf = (
  seqs: readonly number[],
  events: readonly string[]
): readonly RoomEvent[] => {
  const kept = seqs.findIndex((seq, index) => seq !== index + 1);

  return events
    .slice(0, kept === -1 ? events.length : kept)
    .map((text) => pokerCodec.decodeEvent(text));
};

const handStartedAt = (events: readonly RoomEvent[]) =>
  events.findLastIndex(
    (event) =>
      RoomEvents.$is("Table")(event) && Events.$is("HandStarted")(event.event)
  );

const unfinished = (events: readonly RoomEvent[], started: number) =>
  started !== -1 &&
  !events
    .slice(started)
    .some(
      (event) =>
        RoomEvents.$is("HandCancelled")(event) ||
        (RoomEvents.$is("Table")(event) && Events.$is("HandEnded")(event.event))
    );

const stacksBefore = (events: readonly RoomEvent[]) => {
  const started = handStartedAt(events);

  const [opened, ...rest] = unfinished(events, started)
    ? events.slice(0, started)
    : events;

  const stacks = new Map<PlayerId, number>();

  if (opened === undefined || !RoomEvents.$is("RoomOpened")(opened)) {
    return stacks;
  }

  const state = replay([opened, ...rest]);

  if (RoomStates.$is("Open")(state)) {
    for (const seat of state.table.seats) {
      if (Seats.$is("Occupied")(seat)) {
        stacks.set(seat.player, seat.stack);
      }
    }
  }

  return stacks;
};

export const ledgerFromLog = (
  events: readonly RoomEvent[]
): readonly LedgerRow[] => {
  const bought = new Map<PlayerId, number>();
  const paid = new Map<PlayerId, number>();

  for (const event of events) {
    if (RoomEvents.$is("BoughtIn")(event)) {
      bought.set(event.player, (bought.get(event.player) ?? 0) + event.amount);
    }

    if (RoomEvents.$is("CashedOut")(event)) {
      paid.set(event.player, (paid.get(event.player) ?? 0) + event.amount);
    }
  }

  const stacks = stacksBefore(events);

  return Arr.sort(
    [...new Set([...bought.keys(), ...paid.keys(), ...stacks.keys()])],
    Order.String
  ).map((player) => {
    const boughtIn = bought.get(player) ?? 0;
    const cashedOut = (paid.get(player) ?? 0) + (stacks.get(player) ?? 0);

    return { boughtIn, cashedOut, net: cashedOut - boughtIn, player };
  });
};

export const haltedViewOf = Schema.decodeSync(pokerRoom.schemas.view);

export const standingsProblems = (
  view: RoomView,
  ledger: readonly LedgerRow[]
): readonly string[] => {
  if (!RoomViews.$is("Closed")(view)) {
    return ["the standings are not a settled room"];
  }

  const { balances, transfers } = view.settlement;

  const rows = balances
    .map(({ boughtIn, cashedOut, net, player }) => ({
      boughtIn,
      cashedOut,
      net,
      player,
    }))
    .toSorted(Order.mapInput(Order.String, (row: LedgerRow) => row.player));

  const total = rows.reduce((sum, row) => sum + row.net, 0);

  const squared = rows.flatMap(({ net, player }) => {
    const moved = transfers.reduce(
      (sum, transfer) =>
        sum +
        (transfer.to === player ? transfer.amount : 0) -
        (transfer.from === player ? transfer.amount : 0),
      0
    );

    return moved === net
      ? []
      : [`${player} nets ${net} and the transfers move ${moved}`];
  });

  return [
    ...(total === 0 ? [] : [`the nets add up to ${total}`]),
    ...(JSON.stringify(rows) === JSON.stringify(ledger)
      ? []
      : [
          `the standings ${JSON.stringify(rows)} differ from the log's ledger ${JSON.stringify(ledger)}`,
        ]),
    ...squared,
  ];
};

export const unfinishedHand = (events: readonly RoomEvent[]) =>
  unfinished(events, handStartedAt(events));
