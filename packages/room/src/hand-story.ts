import { Events, SEAT_COUNT, ShowdownEntries } from "@nostakes/engine";
import type { Card, SeatIndex } from "@nostakes/engine";
import { Match, Option } from "effect";

import type { SeenTableEvent } from "./redaction.js";

export interface Wager {
  readonly added: number;
  readonly allIn: boolean;
  readonly board: number;
  readonly potBefore: number;
  readonly raise: boolean;
  readonly seat: SeatIndex;
}

export interface Reach {
  readonly board: number;
  readonly seat: SeatIndex;
  readonly total: number;
}

export interface PotResult {
  readonly amount: number;
  readonly eligible: readonly SeatIndex[];
  readonly pot: number;
  readonly run: number;
  readonly winners: readonly SeatIndex[];
}

export interface HandStory {
  readonly allIn: readonly SeatIndex[];
  readonly bigBlind: number;
  readonly boards: readonly (readonly Card[])[];
  readonly committed: readonly number[];
  readonly common: readonly Card[];
  readonly deadMoney: number;
  readonly ended: boolean;
  readonly folded: readonly SeatIndex[];
  readonly handNumber: number;
  readonly reaches: readonly Reach[];
  readonly results: readonly PotResult[];
  readonly showdown: boolean;
  readonly shown: readonly (readonly Card[])[];
  readonly wagers: readonly Wager[];
}

const HOLE_CARDS = 2;

const opening = (handNumber: number): HandStory => ({
  allIn: [],
  bigBlind: 0,
  boards: [[]],
  committed: Array.from({ length: SEAT_COUNT }, () => 0),
  common: [],
  deadMoney: 0,
  ended: false,
  folded: [],
  handNumber,
  reaches: [],
  results: [],
  showdown: false,
  shown: Array.from({ length: SEAT_COUNT }, () => []),
  wagers: [],
});

const potOf = (story: HandStory) => {
  let total = story.deadMoney;

  for (const amount of story.committed) {
    total += amount;
  }

  return total;
};

const markedAllIn = (story: HandStory, seat: SeatIndex, allIn: boolean) =>
  allIn && !story.allIn.includes(seat) ? [...story.allIn, seat] : story.allIn;

const deadPost = (
  story: HandStory,
  seat: SeatIndex,
  amount: number,
  allIn: boolean
): HandStory => ({
  ...story,
  allIn: markedAllIn(story, seat, allIn),
  deadMoney: story.deadMoney + amount,
});

const committing = (
  story: HandStory,
  seat: SeatIndex,
  amount: number,
  allIn: boolean
): HandStory => {
  const committed = story.committed.map((total, index) =>
    index === seat ? total + amount : total
  );

  return {
    ...story,
    allIn: markedAllIn(story, seat, allIn),
    committed,
    reaches: [
      ...story.reaches,
      {
        board: story.common.length,
        seat,
        total: committed[seat] ?? 0,
      },
    ],
  };
};

const wagering = (
  story: HandStory,
  wager: {
    readonly added: number;
    readonly allIn: boolean;
    readonly raise: boolean;
    readonly seat: SeatIndex;
  }
): HandStory => ({
  ...committing(story, wager.seat, wager.added, wager.allIn),
  wagers: [
    ...story.wagers,
    { ...wager, board: story.common.length, potBefore: potOf(story) },
  ],
});

const showing = (
  story: HandStory,
  seat: SeatIndex,
  cards: readonly Card[]
): HandStory => ({
  ...story,
  shown: story.shown.map((held, index) =>
    index === seat
      ? [...held, ...cards.filter((card) => !held.includes(card))].slice(
          0,
          HOLE_CARDS
        )
      : held
  ),
});

const dealing = (
  story: HandStory,
  run: number,
  cards: readonly Card[]
): HandStory =>
  story.boards.length === 1
    ? {
        ...story,
        boards: [[...story.common, ...cards]],
        common: [...story.common, ...cards],
      }
    : {
        ...story,
        boards: story.boards.map((board, index) =>
          index === run - 1 ? [...board, ...cards] : board
        ),
      };

const told = (story: HandStory, event: SeenTableEvent): HandStory =>
  Match.value(event).pipe(
    Match.tagsExhaustive({
      AntePosted: ({ allIn, amount, seat }) =>
        deadPost(story, seat, amount, allIn),
      BlindPosted: ({ allIn, amount, blind, dead, seat }) => ({
        ...(dead === true
          ? deadPost(story, seat, amount, allIn)
          : committing(story, seat, amount, allIn)),
        bigBlind:
          blind === "Big" ? Math.max(story.bigBlind, amount) : story.bigBlind,
      }),
      Called: ({ allIn, amount, seat }) =>
        wagering(story, { added: amount, allIn, raise: false, seat }),
      CardsShown: ({ cards, seat }) => showing(story, seat, cards),
      Checked: () => story,
      ChipsAdded: () => story,
      Folded: ({ seat }) => ({ ...story, folded: [...story.folded, seat] }),
      HandEnded: () => ({ ...story, ended: true }),
      HandMucked: () => story,
      HandStarted: () => story,
      HandTabled: ({ cards, seat }) => ({
        ...showing(story, seat, cards),
        showdown: true,
      }),
      HandsTabled: ({ hands }) => {
        let current = story;

        for (const { cards, seat } of hands) {
          current = showing(current, seat, cards);
        }

        return current;
      },
      HoleCardsDealt: () => story,
      PlayerSat: () => story,
      PlayerStood: () => story,
      PotAwarded: ({ amount, eligible, pot, run, winners }) => ({
        ...story,
        results: [
          ...story.results,
          {
            amount,
            eligible,
            pot,
            run,
            winners: winners.map((winner) => winner.seat),
          },
        ],
      }),
      RabbitHunted: () => story,
      RaisedTo: ({ added, allIn, seat }) =>
        wagering(story, { added, allIn, raise: true, seat }),
      RulesChanged: () => story,
      RunsAgreed: ({ runs }) => ({
        ...story,
        boards: Array.from({ length: runs }, () => story.common),
      }),
      RunsChosen: () => story,
      ShowdownReached: ({ order }) => {
        let current: HandStory = { ...story, showdown: true };

        for (const entry of order) {
          if (ShowdownEntries.$is("Shown")(entry)) {
            current = showing(current, entry.seat, entry.cards);
          }
        }

        return current;
      },
      ShowdownStarted: () => ({ ...story, showdown: true }),
      SittingOutChanged: () => story,
      StraddlePosted: ({ amount, seat }) =>
        committing(story, seat, amount, false),
      StreetDealt: ({ cards, run }) => dealing(story, run, cards),
      UncalledBetReturned: ({ amount, seat }) => ({
        ...story,
        committed: story.committed.map((total, index) =>
          index === seat ? total - amount : total
        ),
      }),
    })
  );

export const storyOf = (
  events: readonly SeenTableEvent[]
): Option.Option<HandStory> => {
  const [first, ...rest] = events;

  if (first === undefined || !Events.$is("HandStarted")(first)) {
    return Option.none();
  }

  let story = opening(first.handNumber);

  for (const event of rest) {
    story = told(story, event);
  }

  return story.ended ? Option.some(story) : Option.none();
};

export const potTotal = (story: HandStory) => {
  let total = 0;

  for (const result of story.results) {
    total += result.amount;
  }

  return total;
};

export const winnersOf = (story: HandStory, run: number) => [
  ...new Set(
    story.results
      .filter((result) => result.run === run)
      .flatMap((result) => result.winners)
  ),
];

export const shownHand = (
  story: HandStory,
  seat: SeatIndex
): Option.Option<readonly Card[]> => {
  const cards = story.shown[seat] ?? [];

  return cards.length === HOLE_CARDS ? Option.some(cards) : Option.none();
};

export const moneyInBoard = (
  story: HandStory,
  contenders: readonly SeatIndex[]
) => {
  const level = Math.min(
    ...contenders.map((seat) => story.committed[seat] ?? 0)
  );

  return Math.max(
    0,
    ...contenders.map(
      (seat) =>
        story.reaches.find(
          (reach) => reach.seat === seat && reach.total >= level
        )?.board ?? 0
    )
  );
};
