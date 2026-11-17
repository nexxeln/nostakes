import { Option, Result, Schema } from "effect";

import type { Card } from "./cards.js";
import type { CommandOf } from "./commands.js";
import type { HandRank } from "./evaluation.js";
import { Events } from "./events.js";
import type { Event, EventOf } from "./events.js";
import { buildPots, handEnded, potAwarded, shareAmong } from "./pots.js";
import type { Pot } from "./pots.js";
import { SeatIndexSchema, chips, splitEvenly } from "./primitives.js";
import type { SeatIndex } from "./primitives.js";
import { NoShowdownChoiceOwed, WinningHandMustTable } from "./rejection.js";
import type { Rejection } from "./rejection.js";
import { ShowdownEntries } from "./showdown.js";
import type { ShowdownEntry } from "./showdown.js";
import {
  Phases,
  boardsOf,
  handPlayerAt,
  isInHand,
  updatePlayer,
  whenInHand,
  withHand,
} from "./state.js";
import type {
  Hand,
  HandPlayer,
  InHand,
  ShowingDown,
  TableState,
} from "./state.js";
import { rankHand } from "./variants.js";

export const ShowdownChoicesSchema = Schema.Struct({
  canMuck: Schema.Boolean,
  canTable: Schema.Boolean,
  seat: SeatIndexSchema,
});

export type ShowdownChoices = typeof ShowdownChoicesSchema.Type;

export const claimsAfter = (
  pots: readonly Pot[],
  entries: readonly ShowdownEntry[]
): readonly (readonly SeatIndex[])[] => {
  let claims = pots.map((pot) => pot.eligible);

  for (const entry of entries) {
    if (ShowdownEntries.$is("Mucked")(entry)) {
      claims = claims.map((claimants) =>
        claimants.length > 1 && claimants.includes(entry.seat)
          ? claimants.filter((seat) => seat !== entry.seat)
          : claimants
      );
    }
  }

  return claims;
};

const tabledRanks = (
  hand: Hand,
  entries: readonly ShowdownEntry[],
  board: readonly Card[]
) => {
  const ranks = new Map<SeatIndex, HandRank>();

  for (const entry of entries) {
    if (ShowdownEntries.$is("Shown")(entry)) {
      ranks.set(entry.seat, rankHand(hand.game, entry.cards, board));
    }
  }

  return ranks;
};

const rankInHand = (hand: Hand, player: HandPlayer) =>
  rankHand(hand.game, player.holeCards, hand.board);

const hasEntry = (entries: readonly ShowdownEntry[], seat: SeatIndex) =>
  entries.some((entry) => entry.seat === seat);

interface Standing {
  readonly beatenInEveryPot: boolean;
  readonly winsPot: Option.Option<number>;
}

interface PotStanding {
  readonly beaten: boolean;
  readonly pot: number;
  readonly wins: boolean;
}

const standingAgainst = (
  claims: readonly (readonly SeatIndex[])[],
  ranks: ReadonlyMap<SeatIndex, HandRank>,
  seat: SeatIndex,
  rank: HandRank
): readonly PotStanding[] =>
  claims.flatMap((claimants, index) => {
    if (!claimants.includes(seat)) {
      return [];
    }

    const rivals = claimants.flatMap((other) => {
      const tabled = ranks.get(other);

      return other === seat || tabled === undefined ? [] : [tabled];
    });

    return [
      {
        beaten: rivals.some((rival) => rival > rank),
        pot: index + 1,
        wins: rivals.length > 0 && rivals.every((rival) => rival <= rank),
      },
    ];
  });

const standingOf = (
  hand: Hand,
  entries: readonly ShowdownEntry[],
  player: HandPlayer
): Standing => {
  const claims = claimsAfter(buildPots(hand), entries);

  const claimed = boardsOf(hand).flatMap((board) =>
    standingAgainst(
      claims,
      tabledRanks(hand, entries, board),
      player.seat,
      rankHand(hand.game, player.holeCards, board)
    )
  );

  return {
    beatenInEveryPot: claimed.every((pot) => pot.beaten),
    winsPot: Option.fromUndefinedOr(claimed.find((pot) => pot.wins)?.pot),
  };
};

const nextToShow = (
  hand: Hand,
  order: readonly SeatIndex[],
  entries: readonly ShowdownEntry[]
) => {
  const claims = claimsAfter(buildPots(hand), entries);

  const contested = (seat: SeatIndex) =>
    claims.some(
      (claimants) => claimants.length > 1 && claimants.includes(seat)
    );

  return Option.fromUndefinedOr(
    order.find((seat) => !hasEntry(entries, seat) && contested(seat))
  );
};

const showingDown = (
  hand: Hand,
  order: readonly SeatIndex[],
  entries: readonly ShowdownEntry[]
) =>
  Phases.ShowingDown({
    entries,
    order,
    toAct: nextToShow(hand, order, entries),
  });

const completeBoard = (hand: Hand): Hand => {
  const { phase } = hand;

  if (
    !Phases.$is("RunningOut")(phase) ||
    phase.runs.length !== boardsOf(hand).length
  ) {
    return hand;
  }

  return {
    ...hand,
    board: [...hand.board, ...(phase.runs[0] ?? [])],
    otherBoards: hand.otherBoards.map((board, index) => [
      ...board,
      ...(phase.runs[index + 1] ?? []),
    ]),
    street: "River",
  };
};

export const openShowdown = (
  state: TableState,
  event: EventOf<"ShowdownStarted">
) =>
  whenInHand(state, (inHand) => {
    const hand = completeBoard(inHand.hand);

    return withHand(inHand, {
      ...hand,
      phase: showingDown(hand, event.order, []),
    });
  });

const withEntry = (
  state: TableState,
  entry: ShowdownEntry,
  update: (player: HandPlayer) => HandPlayer
) =>
  whenInHand(state, (inHand) => {
    const { phase } = inHand.hand;

    if (!Phases.$is("ShowingDown")(phase)) {
      return inHand;
    }

    const hand = updatePlayer(inHand.hand, entry.seat, update);
    const entries = [...phase.entries, entry];

    return withHand(inHand, {
      ...hand,
      phase: showingDown(hand, phase.order, entries),
    });
  });

export const recordTabled = (state: TableState, event: EventOf<"HandTabled">) =>
  withEntry(
    state,
    ShowdownEntries.Shown({
      cards: event.cards,
      rank: event.rank,
      seat: event.seat,
    }),
    (player) => ({ ...player, publicCards: event.cards })
  );

export const recordMucked = (state: TableState, event: EventOf<"HandMucked">) =>
  withEntry(state, ShowdownEntries.Mucked({ seat: event.seat }), (player) => ({
    ...player,
    mucked: true,
  }));

interface Turn {
  readonly hand: Hand;
  readonly phase: ShowingDown;
  readonly player: HandPlayer;
}

const turnOf = (
  state: TableState,
  seat: SeatIndex
): Result.Result<Turn, NoShowdownChoiceOwed> => {
  const hand = isInHand(state) ? state.hand : undefined;
  const phase = hand?.phase;

  const player =
    hand !== undefined &&
    phase !== undefined &&
    Phases.$is("ShowingDown")(phase) &&
    Option.exists(phase.toAct, (toAct) => toAct === seat)
      ? Option.map(handPlayerAt(hand, seat), (found) => ({
          hand,
          phase,
          player: found,
        }))
      : Option.none();

  return Option.match(player, {
    onNone: () => Result.fail(new NoShowdownChoiceOwed({ seat })),
    onSome: (turn) => Result.succeed(turn),
  });
};

export const tableHand = (
  state: TableState,
  command: CommandOf<"TableHand">
): Result.Result<readonly Event[], Rejection> =>
  Result.map(turnOf(state, command.seat), ({ hand, player }) => [
    Events.HandTabled({
      cards: player.holeCards,
      rank: rankInHand(hand, player),
      seat: command.seat,
    }),
  ]);

export const muckHand = (
  state: TableState,
  command: CommandOf<"MuckHand">
): Result.Result<readonly Event[], Rejection> =>
  Result.flatMap(
    turnOf(state, command.seat),
    ({ hand, phase, player }): Result.Result<readonly Event[], Rejection> =>
      Option.match(standingOf(hand, phase.entries, player).winsPot, {
        onNone: () =>
          Result.succeed([Events.HandMucked({ seat: command.seat })]),
        onSome: (pot) =>
          Result.fail(new WinningHandMustTable({ pot, seat: command.seat })),
      })
  );

export interface ShowdownTurn {
  readonly beatenInEveryPot: boolean;
  readonly choices: ShowdownChoices;
}

export const showdownTurn = (
  hand: Hand,
  phase: ShowingDown
): Option.Option<ShowdownTurn> =>
  phase.toAct.pipe(
    Option.flatMap((seat) => handPlayerAt(hand, seat)),
    Option.map((player) => {
      const standing = standingOf(hand, phase.entries, player);

      return {
        beatenInEveryPot: standing.beatenInEveryPot,
        choices: {
          canMuck: Option.isNone(standing.winsPot),
          canTable: true,
          seat: player.seat,
        },
      };
    })
  );

const winnersAmong = (
  claimants: readonly SeatIndex[],
  ranks: ReadonlyMap<SeatIndex, HandRank>
) => {
  if (claimants.length < 2) {
    return claimants;
  }

  const rankOf = (seat: SeatIndex) => ranks.get(seat) ?? 0;
  const best = Math.max(...claimants.map(rankOf));

  return claimants.filter((seat) => rankOf(seat) === best);
};

export const awardShowdown = (
  state: InHand,
  phase: ShowingDown
): readonly Event[] => {
  const pots = buildPots(state.hand);
  const claims = claimsAfter(pots, phase.entries);
  const boards = boardsOf(state.hand);

  return [
    ...boards.flatMap((board, boardIndex) => {
      const ranks = tabledRanks(state.hand, phase.entries, board);

      return pots.map((pot, index) => {
        const part = splitEvenly(pot.amount, boards.length);

        const amount = chips(
          part.share + (boardIndex < part.remainder ? 1 : 0)
        );

        return potAwarded(
          boardIndex + 1,
          index + 1,
          { ...pot, amount },
          shareAmong(
            amount,
            state.button,
            winnersAmong(claims[index] ?? pot.eligible, ranks)
          )
        );
      });
    }),
    handEnded(state),
  ];
};
