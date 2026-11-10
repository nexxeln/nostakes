import { Option, Result } from "effect";

import type { CommandOf } from "./commands.js";
import { Events } from "./events.js";
import type { Event, EventOf } from "./events.js";
import { CHIP_LIMIT, SEAT_INDEXES, chips } from "./primitives.js";
import type { Chips, SeatIndex } from "./primitives.js";
import {
  AmountNotPositive,
  ChipLimitExceeded,
  HandInProgress,
  PlayerAlreadySeated,
  SeatEmpty,
  SeatInHand,
  SeatTaken,
  StraddleAboveChipLimit,
} from "./rejection.js";
import type { Rejection } from "./rejection.js";
import { longestStraddleChain, straddleAmount } from "./rules.js";
import {
  EMPTY_SEAT,
  NO_DEBT,
  Seats,
  isInHand,
  isOccupied,
  occupantOf,
  owesNothing,
  replaceSeat,
} from "./state.js";
import type { BlindDebt, Occupied, TableState } from "./state.js";

export const accept = (...events: readonly Event[]) => Result.succeed(events);

export const dealtIntoCurrentHand = (state: TableState, seat: SeatIndex) =>
  isInHand(state) && state.hand.players.some((player) => player.seat === seat);

const seatedPlayer = (state: TableState, seat: SeatIndex) =>
  Option.match(occupantOf(state, seat), {
    onNone: () => Result.fail(new SeatEmpty({ seat })),
    onSome: (occupant) => Result.succeed(occupant),
  });

const idleSeatedPlayer = (state: TableState, seat: SeatIndex) =>
  Result.flatMap(seatedPlayer(state, seat), (occupant) =>
    dealtIntoCurrentHand(state, seat)
      ? Result.fail(new SeatInHand({ seat }))
      : Result.succeed(occupant)
  );

const chipsInPot = (state: TableState) =>
  isInHand(state)
    ? state.hand.players.reduce<number>(
        (total, player) => total + player.committedTotal - player.won,
        state.hand.deadMoney
      )
    : 0;

export const chipsOnTable = (state: TableState) =>
  state.seats.reduce<number>(
    (total, occupant) => total + (isOccupied(occupant) ? occupant.stack : 0),
    chipsInPot(state)
  );

const bringChips = (
  state: TableState,
  seat: SeatIndex,
  amount: Chips,
  event: Event
): Result.Result<readonly Event[], Rejection> => {
  const available = CHIP_LIMIT - chipsOnTable(state);

  if (amount <= 0) {
    return Result.fail(new AmountNotPositive({ amount }));
  }

  return amount > available
    ? Result.fail(
        new ChipLimitExceeded({ amount, available: chips(available), seat })
      )
    : accept(event);
};

export const sitDown = (state: TableState, command: CommandOf<"SitDown">) => {
  const occupant = occupantOf(state, command.seat);

  if (Option.isSome(occupant)) {
    return Result.fail(
      new SeatTaken({ occupant: occupant.value.player, seat: command.seat })
    );
  }

  const existing = SEAT_INDEXES.find((seat) =>
    Option.exists(
      occupantOf(state, seat),
      (seated) => seated.player === command.player
    )
  );

  if (existing !== undefined) {
    return Result.fail(
      new PlayerAlreadySeated({ player: command.player, seat: existing })
    );
  }

  return bringChips(
    state,
    command.seat,
    command.buyIn,
    Events.PlayerSat({
      buyIn: command.buyIn,
      player: command.player,
      seat: command.seat,
    })
  );
};

export const standUp = (state: TableState, command: CommandOf<"StandUp">) =>
  Result.map(idleSeatedPlayer(state, command.seat), (occupant) => [
    Events.PlayerStood({
      player: occupant.player,
      seat: command.seat,
      stack: occupant.stack,
    }),
  ]);

export const addChips = (state: TableState, command: CommandOf<"AddChips">) =>
  Result.flatMap(idleSeatedPlayer(state, command.seat), () =>
    bringChips(
      state,
      command.seat,
      command.amount,
      Events.ChipsAdded({ amount: command.amount, seat: command.seat })
    )
  );

export const setSittingOut = (
  state: TableState,
  command: CommandOf<"SetSittingOut">
) =>
  Result.map(seatedPlayer(state, command.seat), (occupant) =>
    occupant.sittingOut === command.sittingOut
      ? []
      : [
          Events.SittingOutChanged({
            seat: command.seat,
            sittingOut: command.sittingOut,
          }),
        ]
  );

export const changeRules = (
  state: TableState,
  command: CommandOf<"ChangeRules">
): Result.Result<readonly Event[], Rejection> => {
  const { config } = command;
  const straddles = longestStraddleChain(config);

  if (isInHand(state)) {
    return Result.fail(new HandInProgress({ handNumber: state.handNumber }));
  }

  return straddles > 0 && Option.isNone(straddleAmount(config, straddles - 1))
    ? Result.fail(
        new StraddleAboveChipLimit({ bigBlind: config.bigBlind, straddles })
      )
    : accept(Events.RulesChanged({ config }));
};

const updateOccupant = (
  state: TableState,
  seat: SeatIndex,
  update: (occupant: Occupied) => Occupied
) =>
  Option.match(occupantOf(state, seat), {
    onNone: () => state,
    onSome: (occupant) => ({
      ...state,
      seats: replaceSeat(state.seats, seat, update(occupant)),
    }),
  });

const entryDebt = (state: TableState): BlindDebt => {
  const square = SEAT_INDEXES.filter((index) => {
    const seat = state.seats[index];

    return (
      seat !== undefined &&
      isOccupied(seat) &&
      !seat.sittingOut &&
      (seat.stack > 0 || dealtIntoCurrentHand(state, index)) &&
      owesNothing(seat.owes)
    );
  });

  return state.config.blindPosting === "Casino" &&
    state.handNumber > 0 &&
    square.length >= 2
    ? { ...NO_DEBT, entry: true }
    : NO_DEBT;
};

export const seatPlayer = (state: TableState, event: EventOf<"PlayerSat">) => ({
  ...state,
  seats: replaceSeat(
    state.seats,
    event.seat,
    Seats.Occupied({
      owes: entryDebt(state),
      player: event.player,
      sittingOut: false,
      stack: event.buyIn,
    })
  ),
});

export const emptySeat = (
  state: TableState,
  event: EventOf<"PlayerStood">
) => ({
  ...state,
  seats: replaceSeat(state.seats, event.seat, EMPTY_SEAT),
});

export const addToStack = (
  state: TableState,
  seat: SeatIndex,
  amount: number
) =>
  updateOccupant(state, seat, (occupant) => ({
    ...occupant,
    stack: chips(occupant.stack + amount),
  }));

export const markSittingOut = (
  state: TableState,
  event: EventOf<"SittingOutChanged">
) =>
  updateOccupant(state, event.seat, (occupant) => ({
    ...occupant,
    sittingOut: event.sittingOut,
  }));
