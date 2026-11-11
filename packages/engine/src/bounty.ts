import { Option } from "effect";

import { rankOf } from "./cards.js";
import type { Card } from "./cards.js";
import { Events } from "./events.js";
import type { Event, EventOf, PotShare } from "./events.js";
import { chips } from "./primitives.js";
import type { Chips, PlayerId, SeatIndex } from "./primitives.js";
import { SevenDeuces } from "./rules.js";
import { isInHand, isOccupied } from "./state.js";
import type { InHand, OwedBounty, Seat, TableState } from "./state.js";

const DEUCE = 0;

const SEVEN = 5;

export const isSevenDeuce = (cards: readonly Card[]) => {
  const ranks = cards.map((card) => rankOf(card));

  return ranks.length === 2 && ranks.includes(DEUCE) && ranks.includes(SEVEN);
};

export const unbeatenSeats = (state: InHand) =>
  state.hand.players.filter(
    (player) =>
      state.hand.wonAlone.includes(player.seat) &&
      !state.hand.beaten.includes(player.seat)
  );

interface Dealt {
  readonly player: PlayerId;
  readonly seat: SeatIndex;
}

const payersOf = (
  seats: readonly Seat[],
  dealt: readonly Dealt[],
  owed: OwedBounty
): readonly PotShare[] =>
  dealt.flatMap(({ player, seat }) => {
    const occupant = seats[seat];

    const amount =
      seat !== owed.seat &&
      occupant !== undefined &&
      isOccupied(occupant) &&
      occupant.player === player
        ? Math.min(owed.amount, occupant.stack)
        : 0;

    return amount > 0 ? [{ amount: chips(amount), seat }] : [];
  });

const owedTo = (state: InHand, amount: Chips): Option.Option<OwedBounty> =>
  Option.fromUndefinedOr(
    unbeatenSeats(state).find((player) => isSevenDeuce(player.holeCards))
  ).pipe(
    Option.map((player) => ({ amount, seat: player.seat })),
    Option.filter(
      (owed) => payersOf(state.seats, state.hand.players, owed).length > 0
    )
  );

export const owedBounty = (state: InHand): Option.Option<OwedBounty> =>
  SevenDeuces.$match(state.config.sevenDeuce, {
    Bounty: ({ amount }) => owedTo(state, amount),
    NoBounty: () => Option.none(),
  });

export const collectBounty = (state: TableState): readonly Event[] => {
  if (isInHand(state)) {
    return [];
  }

  return Option.match(state.lastHand, {
    onNone: () => [],
    onSome: (lastHand) =>
      Option.match(lastHand.bounty, {
        onNone: () => [],
        onSome: (owed) => {
          const hidden = lastHand.players.flatMap((player) =>
            player.seat === owed.seat
              ? player.holeCards.filter(
                  (card) => !player.publicCards.includes(card)
                )
              : []
          );

          return [
            ...(hidden.length > 0
              ? [Events.CardsShown({ cards: hidden, seat: owed.seat })]
              : []),
            Events.BountyPaid({
              payers: payersOf(state.seats, lastHand.players, owed),
              seat: owed.seat,
            }),
          ];
        },
      }),
  });
};

export const payBounty = (
  state: TableState,
  event: EventOf<"BountyPaid">
): TableState => {
  if (isInHand(state)) {
    return state;
  }

  let collected = 0;

  for (const payer of event.payers) {
    collected += payer.amount;
  }

  const paidBy = (seat: number) =>
    event.payers.find((payer) => payer.seat === seat)?.amount ?? 0;

  return {
    ...state,
    lastHand: state.lastHand.pipe(
      Option.map((lastHand) => ({ ...lastHand, bounty: Option.none() }))
    ),
    seats: state.seats.map((occupant, seat) =>
      isOccupied(occupant)
        ? {
            ...occupant,
            stack: chips(
              occupant.stack +
                (seat === event.seat ? collected : 0) -
                paidBy(seat)
            ),
          }
        : occupant
    ),
  };
};
