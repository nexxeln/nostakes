import { Option, Result } from "effect";

import type { CommandOf } from "./commands.js";
import { Events } from "./events.js";
import type { Event, EventOf } from "./events.js";
import type { SeatIndex } from "./primitives.js";
import {
  CardAlreadyPublic,
  CardNotHeld,
  FoldedSeatCannotHunt,
  NotInLastHand,
  NothingToHunt,
  RabbitAlreadyHunted,
  RabbitHuntOff,
  ShowBothCards,
} from "./rejection.js";
import type { Rejection } from "./rejection.js";
import { isInHand, occupantOf } from "./state.js";
import type { LastHand, TableState } from "./state.js";

const lastHandOf = (state: TableState) =>
  isInHand(state) ? Option.none() : state.lastHand;

const dealtInLastHand = (state: TableState, seat: SeatIndex) => {
  const found = Option.flatMap(lastHandOf(state), (lastHand) =>
    Option.fromUndefinedOr(
      lastHand.players.find(
        (player) =>
          player.seat === seat &&
          Option.exists(
            occupantOf(state, seat),
            (occupant) => occupant.player === player.player
          )
      )
    ).pipe(Option.map((player) => ({ lastHand, player })))
  );

  return Option.match(found, {
    onNone: () => Result.fail(new NotInLastHand({ seat })),
    onSome: (dealt) => Result.succeed(dealt),
  });
};

export const showCards = (state: TableState, command: CommandOf<"ShowCards">) =>
  Result.flatMap(
    dealtInLastHand(state, command.seat),
    ({ player }): Result.Result<readonly Event[], Rejection> => {
      const notHeld = command.cards.find(
        (card) => !player.holeCards.includes(card)
      );

      const shown = command.cards.find((card) =>
        player.publicCards.includes(card)
      );

      if (notHeld !== undefined) {
        return Result.fail(
          new CardNotHeld({ card: notHeld, seat: command.seat })
        );
      }

      if (shown !== undefined) {
        return Result.fail(
          new CardAlreadyPublic({ card: shown, seat: command.seat })
        );
      }

      const hidden = player.holeCards.filter(
        (card) =>
          !player.publicCards.includes(card) && !command.cards.includes(card)
      );

      if (state.config.voluntaryShows === "BothCards" && hidden.length > 0) {
        return Result.fail(new ShowBothCards({ seat: command.seat }));
      }

      return Result.succeed([
        Events.CardsShown({ cards: command.cards, seat: command.seat }),
      ]);
    }
  );

export const rabbitHunt = (
  state: TableState,
  command: CommandOf<"RabbitHunt">
): Result.Result<readonly Event[], Rejection> => {
  if (!state.config.rabbitHunt) {
    return Result.fail(new RabbitHuntOff({ seat: command.seat }));
  }

  return Result.flatMap(
    dealtInLastHand(state, command.seat),
    ({ lastHand, player }): Result.Result<readonly Event[], Rejection> => {
      if (state.config.rabbitHunters === "StillIn" && player.folded) {
        return Result.fail(new FoldedSeatCannotHunt({ seat: command.seat }));
      }

      if (lastHand.undealt.length === 0) {
        return Result.fail(new NothingToHunt({ seat: command.seat }));
      }

      return lastHand.hunted
        ? Result.fail(new RabbitAlreadyHunted({ seat: command.seat }))
        : Result.succeed([Events.RabbitHunted({ cards: lastHand.undealt })]);
    }
  );
};

const updateLastHand = (
  state: TableState,
  update: (lastHand: LastHand) => LastHand
): TableState =>
  isInHand(state)
    ? state
    : { ...state, lastHand: state.lastHand.pipe(Option.map(update)) };

export const revealShown = (state: TableState, event: EventOf<"CardsShown">) =>
  updateLastHand(state, (lastHand) => ({
    ...lastHand,
    players: lastHand.players.map((player) =>
      player.seat === event.seat
        ? { ...player, publicCards: [...player.publicCards, ...event.cards] }
        : player
    ),
  }));

export const revealRabbit = (state: TableState) =>
  updateLastHand(state, (lastHand) => ({ ...lastHand, hunted: true }));
