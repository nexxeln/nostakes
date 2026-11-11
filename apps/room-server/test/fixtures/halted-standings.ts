import { Events, Seats } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/engine";
import { RoomEvents, RoomStates, RoomViews, replay } from "@nostakes/room";
import type { RoomEvent, RoomState, RoomView } from "@nostakes/room";
import { Array as Arr, Option, Order, Schema } from "effect";

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

const stateOf = (events: readonly RoomEvent[]) => {
  const [opened, ...rest] = events;

  return opened !== undefined && RoomEvents.$is("RoomOpened")(opened)
    ? Option.some(replay([opened, ...rest]))
    : Option.none();
};

const occupied = (state: Option.Option<RoomState>) =>
  state.pipe(
    Option.filter(RoomStates.$is("Open")),
    Option.map(({ table }) =>
      table.seats.flatMap((seat, index) =>
        Seats.$is("Occupied")(seat)
          ? [{ player: seat.player, seat: index, stack: seat.stack }]
          : []
      )
    ),
    Option.getOrElse(
      (): readonly {
        readonly player: PlayerId;
        readonly seat: number;
        readonly stack: number;
      }[] => []
    )
  );

const heldAtTheEnd = (events: readonly RoomEvent[]) => {
  const started = handStartedAt(events);
  const start = events[started];

  const dealtIn =
    unfinished(events, started) &&
    start !== undefined &&
    RoomEvents.$is("Table")(start) &&
    Events.$is("HandStarted")(start.event)
      ? new Set<number>(start.event.dealtIn)
      : new Set<number>();

  const atTheDeal = new Map(
    occupied(stateOf(events.slice(0, started))).map(({ seat, stack }) => [
      seat,
      stack,
    ])
  );

  return new Map(
    occupied(stateOf(events)).map(({ player, seat, stack }) => [
      player,
      dealtIn.has(seat) ? (atTheDeal.get(seat) ?? stack) : stack,
    ])
  );
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

  const stacks = heldAtTheEnd(events);

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

export interface SoundSeqs {
  readonly standings: number;
  readonly ledger: number;
}

const entryText = (row: LedgerRow | undefined) =>
  row === undefined
    ? "absent"
    : `in ${row.boughtIn}, left with ${row.cashedOut}, net ${row.net}`;

const differences = (
  rows: readonly LedgerRow[],
  ledger: readonly LedgerRow[],
  seqs: SoundSeqs
) =>
  Arr.sort(
    [...new Set([...rows, ...ledger].map(({ player }) => player))],
    Order.String
  ).flatMap((player) => {
    const shown = rows.find((row) => row.player === player);
    const logged = ledger.find((row) => row.player === player);

    return JSON.stringify(shown) === JSON.stringify(logged)
      ? []
      : [
          `${player}: ${entryText(shown)} in the standings at sound seq ${seqs.standings}, ${entryText(logged)} in the log's ledger at sound seq ${seqs.ledger}`,
        ];
  });

export const standingsProblems = (
  view: RoomView,
  ledger: readonly LedgerRow[],
  seqs: SoundSeqs
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
    ...(seqs.standings === seqs.ledger
      ? []
      : [
          `the server settled at sound seq ${seqs.standings} and the log's ledger at ${seqs.ledger}`,
        ]),
    ...differences(rows, ledger, seqs),
    ...squared,
  ];
};

export const unfinishedHand = (events: readonly RoomEvent[]) =>
  unfinished(events, handStartedAt(events));
