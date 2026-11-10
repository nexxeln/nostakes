import { Commands } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/engine";
import { Option, Result } from "effect";

import type { RoomCommandOf } from "./commands.js";
import { RoomEvents } from "./events.js";
import { buyIn } from "./money.js";
import {
  AlreadySeated,
  BuyInOutOfRange,
  NoSeatRequest,
  SeatBeyondTable,
  SeatNotFree,
  SeatRequestPending,
} from "./rejection.js";
import { SEATS, heldSeat, occupantAt, seatOf } from "./state.js";
import type { Open } from "./state.js";
import { onTable } from "./table.js";
import type { Millis } from "./time.js";

export const requestSeat = (
  state: Open,
  player: PlayerId,
  command: RoomCommandOf<"RequestSeat">
) => {
  const seated = seatOf(state, player);

  if (Option.isSome(seated)) {
    return Result.fail(new AlreadySeated({ player, seat: seated.value }));
  }

  const pending = state.requests.seats.find(
    (request) => request.player === player
  );

  if (pending !== undefined) {
    return Result.fail(new SeatRequestPending({ player, seat: pending.seat }));
  }

  if (command.seat >= state.settings.seats) {
    return Result.fail(
      new SeatBeyondTable({ seat: command.seat, seats: state.settings.seats })
    );
  }

  const reserved = state.requests.seats.some(
    (request) => request.seat === command.seat
  );

  if (reserved || Option.isSome(occupantAt(state.table, command.seat))) {
    return Result.fail(new SeatNotFree({ seat: command.seat }));
  }

  const { max, min } = state.settings.buyIn;

  if (command.buyIn < min || command.buyIn > max) {
    return Result.fail(
      new BuyInOutOfRange({ amount: command.buyIn, max, min })
    );
  }

  return state.settings.approval.seats && player !== state.host
    ? Result.succeed([
        RoomEvents.SeatRequested({
          at: command.at,
          buyIn: command.buyIn,
          player,
          seat: command.seat,
        }),
      ])
    : buyIn(state, player, command.seat, command.buyIn, command.at);
};

export const answerSeat = (
  state: Open,
  command: RoomCommandOf<"ApproveSeat"> | RoomCommandOf<"DenySeat">,
  approved: boolean
) => {
  const request = state.requests.seats.find(
    (pending) => pending.player === command.player
  );

  if (request === undefined) {
    return Result.fail(new NoSeatRequest({ player: command.player }));
  }

  if (!approved) {
    return Result.succeed([
      RoomEvents.SeatDenied({ at: command.at, player: command.player }),
    ]);
  }

  return Result.map(
    buyIn(state, request.player, request.seat, request.buyIn, command.at),
    (sat) => [
      RoomEvents.SeatApproved({ at: command.at, player: command.player }),
      ...sat,
    ]
  );
};

export const declareStraddle = (
  state: Open,
  player: PlayerId,
  command: RoomCommandOf<"DeclareStraddle">
) =>
  Result.map(heldSeat(state, player), () =>
    state.straddlers.includes(player) === command.on
      ? []
      : [
          RoomEvents.StraddleDeclared({
            at: command.at,
            on: command.on,
            player,
          }),
        ]
  );

export const sitOut = (
  state: Open,
  player: PlayerId,
  sittingOut: boolean,
  at: Millis
) =>
  Result.flatMap(heldSeat(state, player), (seat) =>
    onTable(state.table, Commands.SetSittingOut({ seat, sittingOut }), at)
  );

export const seatsTakenFrom = (state: Open, first: number) =>
  SEATS.filter(
    (seat) =>
      seat >= first &&
      (Option.isSome(occupantAt(state.table, seat)) ||
        state.requests.seats.some((request) => request.seat === seat))
  );

export const choosePosting = (
  state: Open,
  player: PlayerId,
  command: RoomCommandOf<"ChoosePosting">
) =>
  Result.map(heldSeat(state, player), () =>
    state.posters.includes(player) === command.post
      ? []
      : [
          RoomEvents.PostingChosen({
            at: command.at,
            player,
            post: command.post,
          }),
        ]
  );
