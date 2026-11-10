import type { PlayerId } from "@nostakes/engine";
import { Option, Result } from "effect";

import type { RoomCommandOf } from "./commands.js";
import { RoomEvents } from "./events.js";
import { buyIn } from "./money.js";
import {
  AlreadySeated,
  BuyInOutOfRange,
  NoSeatRequest,
  SeatNotFree,
  SeatRequestPending,
} from "./rejection.js";
import { occupantAt, seatOf } from "./state.js";
import type { Open } from "./state.js";

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
