import { Option } from "effect";

import { DECK_SIZE } from "./cards.js";
import { buildPots, uncalledExcess } from "./pots.js";
import { SEAT_COUNT, chips } from "./primitives.js";
import {
  Phases,
  activePlayers,
  isInHand,
  isOccupied,
  notFolded,
  seatAtIndex,
} from "./state.js";
import type { Hand, InHand, TableState } from "./state.js";

export interface Violation {
  readonly invariant: string;
  readonly detail: string;
}

const violation = (invariant: string, detail: string): Violation => ({
  detail,
  invariant,
});

const isWholeChips = (amount: number) =>
  Number.isSafeInteger(amount) && amount >= 0;

const BOARD_BY_STREET = { Flop: 3, Preflop: 0, River: 5, Turn: 4 };

const seatViolations = (state: TableState) => [
  ...(state.seats.length === SEAT_COUNT
    ? []
    : [violation("NineSeats", `found ${state.seats.length} seats`)]),
  ...state.seats.flatMap((seat, index) =>
    isOccupied(seat) && !isWholeChips(seat.stack)
      ? [violation("WholeStacks", `seat ${index} holds ${seat.stack}`)]
      : []
  ),
];

const amountViolations = (hand: Hand) => [
  ...(isWholeChips(hand.deadMoney)
    ? []
    : [violation("WholeAmounts", `dead money is ${hand.deadMoney}`)]),
  ...hand.players.flatMap((player) =>
    [player.committedThisStreet, player.committedTotal, player.won].every(
      isWholeChips
    ) && player.committedThisStreet <= player.committedTotal
      ? []
      : [
          violation(
            "WholeAmounts",
            `seat ${player.seat} has ${player.committedThisStreet} this street, ${player.committedTotal} in total, and won ${player.won}`
          ),
        ]
  ),
];

const sumOf = (amounts: readonly number[]) =>
  amounts.reduce((total, amount) => total + amount, 0);

const potViolations = (hand: Hand) => {
  const committed =
    sumOf(hand.players.map((player) => player.committedTotal)) + hand.deadMoney;

  const won = sumOf(hand.players.map((player) => player.won));

  const returned: Hand = Option.match(uncalledExcess(hand), {
    onNone: () => hand,
    onSome: (excess) => ({
      ...hand,
      players: hand.players.map((player) =>
        player.seat === excess.seat
          ? {
              ...player,
              committedTotal: chips(player.committedTotal - excess.amount),
            }
          : player
      ),
    }),
  });

  return [
    ...(won <= committed
      ? []
      : [violation("AwardsWithinPot", `${won} won from ${committed}`)]),
    ...(notFolded(hand).length > 0 &&
    buildPots(returned).some((pot) => pot.eligible.length === 0)
      ? [violation("EveryPotHasAnEligibleSeat", "a pot has no eligible seat")]
      : []),
    ...hand.players.flatMap((player) =>
      player.mucked && player.won > 0
        ? [violation("MuckedHandsWinNothing", `seat ${player.seat} won`)]
        : []
    ),
  ];
};

const cardViolations = (hand: Hand) => {
  const runs = Phases.$is("RunningOut")(hand.phase) ? hand.phase.runs : [];

  const all = [
    ...hand.players.flatMap((player) => player.holeCards),
    ...hand.board,
    ...runs.flat(),
    ...hand.deck,
  ];

  return [
    ...(all.length === DECK_SIZE && new Set(all).size === DECK_SIZE
      ? []
      : [
          violation(
            "OneDeck",
            `${all.length} cards, ${new Set(all).size} distinct`
          ),
        ]),
    ...(BOARD_BY_STREET[hand.street] === hand.board.length
      ? []
      : [
          violation(
            "BoardMatchesStreet",
            `${hand.board.length} cards on the ${hand.street}`
          ),
        ]),
    ...hand.players.flatMap((player) =>
      player.publicCards.every((card) => player.holeCards.includes(card)) &&
      (player.status !== "Folded" || player.publicCards.length === 0)
        ? []
        : [violation("PublicCardsAreOwnCards", `seat ${player.seat}`)]
    ),
  ];
};

const playerViolations = (state: InHand) => {
  const paying = state.hand.players.some((player) => player.won > 0);

  return state.hand.players.flatMap((player) => {
    const seat = seatAtIndex(state, player.seat);

    if (!isOccupied(seat) || seat.player !== player.player) {
      return [violation("DealtSeatsStayOccupied", `seat ${player.seat}`)];
    }

    const statusMatchesStack =
      paying ||
      player.status === "Folded" ||
      (player.status === "Active") === seat.stack > 0;

    return statusMatchesStack
      ? []
      : [
          violation(
            "AllInMeansEmpty",
            `seat ${player.seat} is ${player.status} with ${seat.stack}`
          ),
        ];
  });
};

const phaseViolations = (state: InHand) =>
  Phases.$match(state.hand.phase, {
    Betting: (betting) => {
      const toAct = state.hand.players.find(
        (player) => player.seat === betting.toAct
      );

      const topThisStreet = Math.max(
        0,
        ...state.hand.players.map((player) => player.committedThisStreet)
      );

      return [
        ...(toAct?.status === "Active"
          ? []
          : [violation("ToActIsActive", `seat ${betting.toAct}`)]),
        ...(betting.currentBet >= topThisStreet &&
        betting.lastFullRaise >= state.config.bigBlind
          ? []
          : [
              violation(
                "BetCoversCommitments",
                `bet ${betting.currentBet}, top ${topThisStreet}, last raise ${betting.lastFullRaise}`
              ),
            ]),
      ];
    },
    ChoosingRuns: (choosing) => {
      const owing = [
        ...choosing.pending,
        ...choosing.choices.map((choice) => choice.seat),
      ].toSorted((left, right) => left - right);

      const contenders = notFolded(state.hand).map((player) => player.seat);

      return owing.join(",") === contenders.join(",") &&
        activePlayers(state.hand).length < 2 &&
        choosing.maxRuns >= 2 &&
        choosing.maxRuns <= state.config.maxRuns &&
        choosing.choices.every(
          (choice) => choice.runs >= 1 && choice.runs <= choosing.maxRuns
        )
        ? []
        : [violation("RunChoicesFromContenders", owing.join(","))];
    },
    RunningOut: () => [],
    Settling: () => [],
  });

const handViolations = (state: InHand) => [
  ...amountViolations(state.hand),
  ...potViolations(state.hand),
  ...cardViolations(state.hand),
  ...playerViolations(state),
  ...phaseViolations(state),
];

export const invariants = (state: TableState): readonly Violation[] => [
  ...seatViolations(state),
  ...(Number.isSafeInteger(state.handNumber) && state.handNumber >= 0
    ? []
    : [violation("HandNumber", `${state.handNumber}`)]),
  ...(isInHand(state)
    ? handViolations(state)
    : Option.match(state.lastHand, {
        onNone: () => [],
        onSome: (lastHand) =>
          lastHand.players.flatMap((player) =>
            player.publicCards.every((card) => player.holeCards.includes(card))
              ? []
              : [violation("PublicCardsAreOwnCards", `seat ${player.seat}`)]
          ),
      })),
];
