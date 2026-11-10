import { ChipsSchema, Commands, Seats, TableStates } from "@nostakes/engine";
import type { Chips, PlayerId, SeatIndex } from "@nostakes/engine";
import {
  AmountSchema,
  BoughtIn as boughtInEntry,
  CashedOut as cashedOutEntry,
  balances,
  settle,
} from "@nostakes/ledger";
import type { LedgerEntry, Unbalanced } from "@nostakes/ledger";
import { Option, Result } from "effect";

import type { RoomCommandOf } from "./commands.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import {
  AlreadyLeaving,
  ChipRequestPending,
  ChipsOverMax,
  NoChipRequest,
  SettlesAfterHand,
  TopUpNotAllowed,
} from "./rejection.js";
import { sealBinds } from "./sealed-hand.js";
import type { Settlement } from "./settlement.js";
import { RoomStates, SEATS, heldSeat, occupantAt } from "./state.js";
import type { Entries, Open, RoomState } from "./state.js";
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
): Decision =>
  dealtIn(state, seat)
    ? Option.match(occupantAt(state.table, seat), {
        onNone: () => Result.succeed([]),
        onSome: ({ player }) =>
          Result.succeed([RoomEvents.ChipsQueued({ amount, at, player })]),
      })
    : onTable(state.table, Commands.AddChips({ amount, seat }), at);

export const standUp = (state: Open, seat: SeatIndex, at: Millis) =>
  onTable(state.table, Commands.StandUp({ seat }), at);

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

const topUpRefusal = (
  state: Open,
  player: PlayerId,
  seat: SeatIndex,
  holding: number
): Option.Option<TopUpNotAllowed> => {
  const rule = state.settings.topUps;
  const { min } = state.settings.buyIn;

  if (rule === "UpToMax") {
    return Option.none();
  }

  const duringHand = dealtIn(state, seat);
  const allowed = rule === "BelowMin" ? holding < min : holding === 0;

  return !duringHand && allowed
    ? Option.none()
    : Option.some(
        new TopUpNotAllowed({
          duringHand,
          holding: ChipsSchema.make(holding),
          min,
          player,
          rule,
        })
      );
};

export const requestChips = (
  state: Open,
  player: PlayerId,
  command: RoomCommandOf<"RequestChips">
) =>
  Result.flatMap(heldSeat(state, player), (seat): Decision => {
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
    const refusal = topUpRefusal(state, player, seat, stack);

    if (Option.isSome(refusal)) {
      return Result.fail(refusal.value);
    }

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

  return Result.flatMap(heldSeat(state, command.player), (seat) =>
    Result.map(addChips(state, seat, request.amount, command.at), (added) => [
      RoomEvents.ChipsApproved({ at: command.at, player: command.player }),
      ...added,
    ])
  );
};

export const leaveSeat = (
  state: Open,
  player: PlayerId,
  at: Millis
): Decision =>
  Result.flatMap(heldSeat(state, player), (seat): Decision => {
    if (!dealtIn(state, seat) && !sealBinds(state, seat, at)) {
      return standUp(state, seat, at);
    }

    return state.queued.leaving.includes(player)
      ? Result.fail(new AlreadyLeaving({ player }))
      : Result.succeed([RoomEvents.LeaveQueued({ at, player })]);
  });

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

export const allEntries = (entries: Entries) => [...entries.values()].flat();

const stacksCashedOut = (state: Open): readonly LedgerEntry<PlayerId>[] =>
  SEATS.flatMap((seat) =>
    Option.match(occupantAt(state.table, seat), {
      onNone: () => [],
      onSome: (occupant) =>
        occupant.stack > 0 ? [cashedOut(occupant.player, occupant.stack)] : [],
    })
  );

export const settlementOf = (
  state: Open
): Result.Result<Settlement, SettlesAfterHand | Unbalanced> => {
  if (TableStates.$is("InHand")(state.table)) {
    return Result.fail(
      new SettlesAfterHand({ handNumber: state.table.handNumber })
    );
  }

  const rows = balances([
    ...allEntries(state.entries),
    ...stacksCashedOut(state),
  ]);

  return Result.map(settle(rows), (transfers) => ({
    balances: rows,
    transfers,
  }));
};

export const settlement = (
  state: RoomState
): Result.Result<Settlement, SettlesAfterHand | Unbalanced> =>
  RoomStates.$match(state, {
    Closed: (closed) => Result.succeed(closed.settlement),
    Open: (open) => settlementOf(open),
  });
