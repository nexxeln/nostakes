import { Option } from "effect";

import { DECK_SIZE } from "./cards.js";
import type { Card } from "./cards.js";
import { buildPots, uncalledExcess } from "./pots.js";
import { CHIP_LIMIT, SEAT_COUNT, chips } from "./primitives.js";
import type { SeatIndex } from "./primitives.js";
import { chipsOnTable } from "./seating.js";
import { ShowdownEntries } from "./showdown.js";
import { claimsAfter } from "./showing-down.js";
import {
  Phases,
  activePlayers,
  isInHand,
  isOccupied,
  notFolded,
  seatAtIndex,
} from "./state.js";
import type { Hand, InHand, ShowingDown, TableState } from "./state.js";

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

const withUncalledReturned = (hand: Hand): Hand =>
  Option.match(uncalledExcess(hand), {
    onNone: () => hand,
    onSome: ({ amount, seat }) =>
      withUncalledReturned({
        ...hand,
        players: hand.players.map((player) =>
          player.seat === seat
            ? {
                ...player,
                committedTotal: chips(player.committedTotal - amount),
              }
            : player
        ),
      }),
  });

const soleClaims = (hand: Hand, returned: Hand) => {
  const pots = buildPots(returned);

  if (!Phases.$is("ShowingDown")(hand.phase)) {
    return { claims: pots.map((pot) => pot.eligible), pots };
  }

  return { claims: claimsAfter(pots, hand.phase.entries), pots };
};

const muckedWinnings = (hand: Hand, returned: Hand) => {
  const { claims, pots } = soleClaims(hand, returned);

  const uncontested = (seat: SeatIndex) =>
    sumOf(
      pots.map((pot, index) => {
        const claimants = claims[index] ?? [];

        return claimants.length === 1 && claimants[0] === seat ? pot.amount : 0;
      })
    );

  return [
    ...hand.players.flatMap((player) =>
      player.mucked && player.won > uncontested(player.seat)
        ? [
            violation(
              "MuckedHandsWinOnlyUncontestedPots",
              `seat ${player.seat} won ${player.won}`
            ),
          ]
        : []
    ),
    ...(Phases.$is("ShowingDown")(hand.phase) &&
    claims.some((claimants) => claimants.length === 0)
      ? [violation("EveryPotHasAClaimant", "a pot has no claimant")]
      : []),
  ];
};

const showingDownViolations = (hand: Hand, showing: ShowingDown) => {
  const contenders = notFolded(hand)
    .map((player) => player.seat)
    .toSorted((left, right) => left - right);

  const ordered = showing.order.toSorted((left, right) => left - right);

  const positions = showing.entries.map((entry) =>
    showing.order.indexOf(entry.seat)
  );

  const claims = claimsAfter(buildPots(hand), showing.entries);

  const firstWaiting = showing.order.find(
    (seat) =>
      !showing.entries.some((entry) => entry.seat === seat) &&
      claims.some(
        (claimants) => claimants.length > 1 && claimants.includes(seat)
      )
  );

  const matchesPlayer = showing.entries.every((entry) => {
    const player = hand.players.find(
      (candidate) => candidate.seat === entry.seat
    );

    return ShowdownEntries.$match(entry, {
      Mucked: () => player?.mucked === true,
      Shown: ({ cards }) =>
        player !== undefined &&
        cards.join(",") === player.holeCards.join(",") &&
        player.publicCards.join(",") === cards.join(","),
    });
  });

  return [
    ...(ordered.join(",") === contenders.join(",") && hand.board.length === 5
      ? []
      : [violation("ShowdownOrderIsTheContenders", ordered.join(","))]),
    ...(positions.every(
      (position, index) => position > (positions[index - 1] ?? -1)
    ) && matchesPlayer
      ? []
      : [violation("ShowdownEntriesFollowTheOrder", positions.join(","))]),
    ...(Option.getOrUndefined(showing.toAct) === firstWaiting
      ? []
      : [
          violation(
            "ShowdownAsksTheFirstContestedSeat",
            `asks ${Option.getOrUndefined(showing.toAct)}, first contested ${firstWaiting}`
          ),
        ]),
  ];
};

const potViolations = (hand: Hand) => {
  const committed =
    sumOf(hand.players.map((player) => player.committedTotal)) + hand.deadMoney;

  const won = sumOf(hand.players.map((player) => player.won));

  const returned = withUncalledReturned(hand);

  return [
    ...(won <= committed
      ? []
      : [violation("AwardsWithinPot", `${won} won from ${committed}`)]),
    ...(notFolded(hand).length > 0 &&
    buildPots(returned).some((pot) => pot.eligible.length === 0)
      ? [violation("EveryPotHasAnEligibleSeat", "a pot has no eligible seat")]
      : []),
    ...muckedWinnings(hand, returned),
  ];
};

const distinctCards = (groups: readonly (readonly Card[])[]) => {
  const seen = new Uint8Array(DECK_SIZE);
  let count = 0;
  let distinct = 0;

  for (const group of groups) {
    for (const card of group) {
      count += 1;
      distinct += seen[card] === 0 ? 1 : 0;
      seen[card] = 1;
    }
  }

  return { count, distinct };
};

const cardViolations = (hand: Hand) => {
  const runs = Phases.$is("RunningOut")(hand.phase) ? hand.phase.runs : [];

  const cards = distinctCards([
    ...hand.players.map((player) => player.holeCards),
    hand.board,
    ...runs,
    hand.deck,
  ]);

  return [
    ...(cards.count === DECK_SIZE && cards.distinct === DECK_SIZE
      ? []
      : [
          violation(
            "OneDeck",
            `${cards.count} cards, ${cards.distinct} distinct`
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
    ShowingDown: (showing) => showingDownViolations(state.hand, showing),
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
  ...(chipsOnTable(state) <= CHIP_LIMIT
    ? []
    : [
        violation(
          "ChipsWithinLimit",
          `${chipsOnTable(state)} chips on the table`
        ),
      ]),
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
