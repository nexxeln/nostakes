import { ChipsSchema, Commands, Seats, TableStates } from "@nostakes/engine";
import type { Chips, PlayerId, SeatIndex } from "@nostakes/engine";
import {
  AmountSchema,
  BoughtIn as boughtInEntry,
  CashedOut as cashedOutEntry,
} from "@nostakes/ledger";
import type { LedgerEntry } from "@nostakes/ledger";
import { Option, Result } from "effect";

import type { RoomCommandOf } from "./commands.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import {
  ChipRequestPending,
  ChipsOverMax,
  NoChipRequest,
  NotSeated,
} from "./rejection.js";
import { occupantAt, seatOf } from "./state.js";
import type { Entries, Open } from "./state.js";
import { onTable } from "./table.js";
import type { Millis } from "./time.js";

export const withEntry = (
  entries: Entries,
  entry: LedgerEntry<PlayerId>
): Entries => {
  const earlier = entries.get(entry.player) ?? [];

  return new Map([...entries, [entry.player, [...earlier, entry]]]);
};

export const boughtIn = (player: PlayerId, amount: Chips) =>
  boughtInEntry({ amount: AmountSchema.make(amount), player });

export const cashedOut = (player: PlayerId, amount: Chips) =>
  cashedOutEntry({ amount: AmountSchema.make(amount), player });

export const buyIn = (
  state: Open,
  player: PlayerId,
  seat: SeatIndex,
  amount: Chips,
  at: Millis
) =>
  onTable(state.table, Commands.SitDown({ buyIn: amount, player, seat }), at);

export const dealtIn = (state: Open, seat: SeatIndex) =>
  TableStates.$is("InHand")(state.table) &&
  state.table.hand.players.some((player) => player.seat === seat);

export const addChips = (
  state: Open,
  seat: SeatIndex,
  amount: Chips,
  at: Millis
) => onTable(state.table, Commands.AddChips({ amount, seat }), at);

export const standUp = (state: Open, seat: SeatIndex, at: Millis) =>
  onTable(state.table, Commands.StandUp({ seat }), at);

const seatedSeat = (state: Open, player: PlayerId) =>
  Option.match(seatOf(state, player), {
    onNone: () => Result.fail(new NotSeated({ player })),
    onSome: (seat) => Result.succeed(seat),
  });

const stackAt = (state: Open, seat: SeatIndex) =>
  Option.match(occupantAt(state.table, seat), {
    onNone: () => 0,
    onSome: (occupant) => occupant.stack,
  });

const onTheWay = (state: Open, player: PlayerId) => {
  let total = 0;

  for (const queued of state.queued.chips) {
    total += queued.player === player ? queued.amount : 0;
  }

  return total;
};

export const requestChips = (
  state: Open,
  player: PlayerId,
  command: RoomCommandOf<"RequestChips">
) =>
  Result.flatMap(seatedSeat(state, player), (seat): Decision => {
    const pending = state.requests.chips.find(
      (request) => request.player === player
    );

    if (pending !== undefined) {
      return Result.fail(
        new ChipRequestPending({ amount: pending.amount, player })
      );
    }

    const stack = stackAt(state, seat) + onTheWay(state, player);
    const { max } = state.settings.buyIn;

    if (stack + command.amount > max) {
      return Result.fail(
        new ChipsOverMax({
          amount: command.amount,
          holding: ChipsSchema.make(stack),
          max,
          player,
        })
      );
    }

    return state.settings.approval.chips && player !== state.host
      ? Result.succeed([
          RoomEvents.ChipsRequested({
            amount: command.amount,
            at: command.at,
            player,
          }),
        ])
      : addChips(state, seat, command.amount, command.at);
  });

export const answerChips = (
  state: Open,
  command: RoomCommandOf<"ApproveChips"> | RoomCommandOf<"DenyChips">,
  approved: boolean
) => {
  const request = state.requests.chips.find(
    (pending) => pending.player === command.player
  );

  if (request === undefined) {
    return Result.fail(new NoChipRequest({ player: command.player }));
  }

  if (!approved) {
    return Result.succeed([
      RoomEvents.ChipsDenied({ at: command.at, player: command.player }),
    ]);
  }

  return Result.flatMap(seatedSeat(state, command.player), (seat) =>
    Result.map(addChips(state, seat, request.amount, command.at), (added) => [
      RoomEvents.ChipsApproved({ at: command.at, player: command.player }),
      ...added,
    ])
  );
};

export const leaveSeat = (state: Open, player: PlayerId, at: Millis) =>
  Result.flatMap(seatedSeat(state, player), (seat) => standUp(state, seat, at));

export const chipsOnTable = (state: Open) => {
  let total = 0;

  for (const seat of state.table.seats) {
    total += Seats.$is("Occupied")(seat) ? seat.stack : 0;
  }

  if (TableStates.$is("InHand")(state.table)) {
    total += state.table.hand.deadMoney;

    for (const player of state.table.hand.players) {
      total += player.committedTotal - player.won;
    }
  }

  return total;
};
