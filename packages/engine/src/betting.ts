import { Option } from "effect";

import type { Chips, SeatIndex } from "./primitives.js";
import { SEAT_COUNT } from "./primitives.js";
import type { TableConfig } from "./rules.js";
import { Phases, activePlayers, playersClockwiseAfter } from "./state.js";
import type { Hand, HandPlayer, Phase, Round } from "./state.js";

export const openRound = (currentBet: Chips, lastFullRaise: Chips): Round => ({
  actedAt: Array.from({ length: SEAT_COUNT }, () => Option.none()),
  currentBet,
  lastAggressor: Option.none(),
  lastFullRaise,
});

const needsToAct = (round: Round, player: HandPlayer, activeCount: number) =>
  player.status === "Active" &&
  (player.committedThisStreet < round.currentBet ||
    (Option.isNone(round.actedAt[player.seat] ?? Option.none()) &&
      activeCount > 1));

export const seatToAct = (hand: Hand, round: Round, after: SeatIndex) => {
  const activeCount = activePlayers(hand).length;

  return Option.map(
    Option.fromUndefinedOr(
      playersClockwiseAfter(hand.players, after).find((player) =>
        needsToAct(round, player, activeCount)
      )
    ),
    (player) => player.seat
  );
};

export const closedStreet = (
  _config: TableConfig,
  _hand: Hand,
  lastAggressor: Option.Option<SeatIndex>
): Phase => Phases.Settling({ lastAggressor });

export const continueBetting = (
  config: TableConfig,
  hand: Hand,
  round: Round,
  after: SeatIndex
): Phase =>
  Option.match(seatToAct(hand, round, after), {
    onNone: () => closedStreet(config, hand, round.lastAggressor),
    onSome: (toAct) => Phases.Betting({ ...round, toAct }),
  });
