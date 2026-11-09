import { Option } from "effect";

import { Events } from "./events.js";
import type { Event, EventOf } from "./events.js";
import { SEAT_COUNT, chips, splitEvenly } from "./primitives.js";
import type { Chips, SeatIndex } from "./primitives.js";
import {
  Phases,
  TableStates,
  notFolded,
  updatePlayer,
  whenInHand,
  withStackChange,
} from "./state.js";
import type { Hand, HandPlayer, InHand, TableState } from "./state.js";

export interface Pot {
  readonly amount: Chips;
  readonly eligible: readonly SeatIndex[];
}

const potLevels = (hand: Hand) => {
  const top = Math.max(
    0,
    ...hand.players.map((player) => player.committedTotal)
  );

  const allInLevels = hand.players
    .filter((player) => player.status === "AllIn")
    .map((player) => player.committedTotal);

  return [...new Set([...allInLevels, top])]
    .filter((level) => level > 0)
    .toSorted((left, right) => left - right);
};

const layer = (players: readonly HandPlayer[], floor: number, level: number) =>
  players.reduce(
    (sum, player) =>
      sum + Math.min(Math.max(player.committedTotal - floor, 0), level - floor),
    0
  );

export const buildPots = (hand: Hand): readonly Pot[] => {
  const contenders = notFolded(hand);
  const levels = potLevels(hand);

  return levels.map((level, index) => {
    const floor = levels[index - 1] ?? 0;
    const dead = index === 0 ? hand.deadMoney : 0;

    return {
      amount: chips(layer(hand.players, floor, level) + dead),
      eligible: contenders
        .filter((player) => player.committedTotal >= level)
        .map((player) => player.seat),
    };
  });
};

export const clockwiseDistance = (button: SeatIndex, seat: SeatIndex) =>
  (seat - button + SEAT_COUNT - 1) % SEAT_COUNT;

export const oddChipOrder = (button: SeatIndex, seats: readonly SeatIndex[]) =>
  seats.toSorted(
    (left, right) =>
      clockwiseDistance(button, left) - clockwiseDistance(button, right)
  );

export const shareAmong = (
  amount: Chips,
  button: SeatIndex,
  winners: readonly SeatIndex[]
) => {
  const { remainder, share } = splitEvenly(amount, winners.length);

  return oddChipOrder(button, winners).map((seat, place) => ({
    amount: chips(share + (place < remainder ? 1 : 0)),
    seat,
  }));
};

export const potAwarded = (
  run: number,
  pot: number,
  awarded: Pot,
  winners: readonly { readonly amount: Chips; readonly seat: SeatIndex }[]
) =>
  Events.PotAwarded({
    amount: awarded.amount,
    eligible: awarded.eligible,
    pot,
    run,
    winners,
  });

export const handEnded = (state: InHand) =>
  Events.HandEnded({ handNumber: state.handNumber });

export const foldOut = (state: InHand): readonly Event[] => {
  const [last] = notFolded(state.hand);

  return [
    ...buildPots(state.hand).map((pot, index) =>
      potAwarded(
        1,
        index + 1,
        pot,
        last === undefined ? [] : [{ amount: pot.amount, seat: last.seat }]
      )
    ),
    handEnded(state),
  ];
};

export const awardPot = (state: TableState, event: EventOf<"PotAwarded">) =>
  whenInHand(state, (inHand) => {
    let { hand, seats } = inHand;

    for (const winner of event.winners) {
      hand = updatePlayer(hand, winner.seat, (player) => ({
        ...player,
        won: chips(player.won + winner.amount),
      }));
      seats = withStackChange(seats, winner.seat, winner.amount);
    }

    return { ...inHand, hand, seats };
  });

const undealtBoard = (hand: Hand) =>
  Phases.$is("RunningOut")(hand.phase)
    ? []
    : hand.deck.slice(0, Math.max(0, 5 - hand.board.length));

export const endHand = (state: TableState) =>
  whenInHand(state, (inHand) =>
    TableStates.BetweenHands({
      button: Option.some(inHand.button),
      config: inHand.config,
      handNumber: inHand.handNumber,
      lastHand: Option.some({
        hunted: false,
        players: inHand.hand.players.map((player) => ({
          holeCards: player.holeCards,
          player: player.player,
          publicCards: player.publicCards,
          seat: player.seat,
        })),
        undealt: undealtBoard(inHand.hand),
      }),
      seats: inHand.seats,
    })
  );
