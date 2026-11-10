import { Data, Option } from "effect";

import type { Card } from "./cards.js";
import { evaluate } from "./evaluation.js";
import type { HandRank } from "./evaluation.js";
import { Events } from "./events.js";
import type { Event, EventOf } from "./events.js";
import { buildPots, handEnded, potAwarded, shareAmong } from "./pots.js";
import type { Pot } from "./pots.js";
import type { SeatIndex } from "./primitives.js";
import {
  notFolded,
  playersClockwiseAfter,
  updatePlayer,
  whenInHand,
} from "./state.js";
import type { HandPlayer, InHand, TableState } from "./state.js";

export type ShowdownEntry = Data.TaggedEnum<{
  Mucked: { readonly seat: SeatIndex };
  Shown: {
    readonly cards: readonly Card[];
    readonly rank: HandRank;
    readonly seat: SeatIndex;
  };
}>;

export const ShowdownEntries = Data.taggedEnum<ShowdownEntry>();

interface Ranked {
  readonly player: HandPlayer;
  readonly rank: HandRank;
}

export const rankOnBoard = (
  players: readonly HandPlayer[],
  board: readonly Card[]
): readonly Ranked[] =>
  players.map((player) => ({
    player,
    rank: evaluate([...player.holeCards, ...board]),
  }));

export const startingWith = (
  state: InHand,
  lastAggressor: Option.Option<SeatIndex>
) => {
  const contenders = notFolded(state.hand);

  const aggressor = lastAggressor.pipe(
    Option.filter((seat) => contenders.some((player) => player.seat === seat))
  );

  return Option.match(aggressor, {
    onNone: () => playersClockwiseAfter(contenders, state.button),
    onSome: (seat) => [
      ...contenders.filter((player) => player.seat >= seat),
      ...contenders.filter((player) => player.seat < seat),
    ],
  });
};

const rankOf = (ranked: readonly Ranked[], seat: SeatIndex) =>
  ranked.find((entry) => entry.player.seat === seat)?.rank ?? 0;

export const showOrMuck = (
  ordered: readonly Ranked[],
  pots: readonly Pot[]
): readonly ShowdownEntry[] => {
  const shown: Ranked[] = [];

  return ordered.map((entry) => {
    const { seat } = entry.player;

    const stillContesting = pots.some(
      (pot) =>
        pot.eligible.includes(seat) &&
        shown.every(
          (other) =>
            !pot.eligible.includes(other.player.seat) ||
            entry.rank >= other.rank
        )
    );

    if (shown.length > 0 && !stillContesting) {
      return ShowdownEntries.Mucked({ seat });
    }

    shown.push(entry);

    return ShowdownEntries.Shown({
      cards: entry.player.holeCards,
      rank: entry.rank,
      seat,
    });
  });
};

export const awardPart = (
  state: InHand,
  run: number,
  ranked: readonly Ranked[],
  part: { readonly index: number; readonly pot: Pot }
) => {
  const best = Math.max(
    ...part.pot.eligible.map((seat) => rankOf(ranked, seat))
  );

  const winners = part.pot.eligible.filter(
    (seat) => rankOf(ranked, seat) === best
  );

  return potAwarded(
    run,
    part.index + 1,
    part.pot,
    shareAmong(part.pot.amount, state.button, winners)
  );
};

export const showdown = (
  state: InHand,
  lastAggressor: Option.Option<SeatIndex>
): readonly Event[] => {
  const pots = buildPots(state.hand);

  const ranked = rankOnBoard(
    startingWith(state, lastAggressor),
    state.hand.board
  );

  return [
    Events.ShowdownReached({ order: showOrMuck(ranked, pots), run: 1 }),
    ...pots.map((pot, index) => awardPart(state, 1, ranked, { index, pot })),
    handEnded(state),
  ];
};

export const revealShowdown = (
  state: TableState,
  event: EventOf<"ShowdownReached">
) =>
  whenInHand(state, (inHand) => {
    let { hand } = inHand;

    for (const entry of event.order) {
      hand = updatePlayer(hand, entry.seat, (player) =>
        ShowdownEntries.$match(entry, {
          Mucked: () => ({ ...player, mucked: true }),
          Shown: (shown) => ({ ...player, publicCards: shown.cards }),
        })
      );
    }

    return { ...inHand, hand };
  });
