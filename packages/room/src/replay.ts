import { Events, ShowdownEntries } from "@nostakes/engine";
import type { Card, SeatIndex, ShowdownEntry, Street } from "@nostakes/engine";
import { Data, Match, Option } from "effect";

import { equities, percentOf } from "./equity.js";
import { moneyInBoard, storyOf } from "./hand-story.js";
import type { HandStory } from "./hand-story.js";
import type { SeenTableEvent } from "./redaction.js";

export type Post = "Ante" | "Big" | "Dead" | "Small" | "Straddle";

export type Act = "Bet" | "Call" | "Check" | "Fold" | "Raise";

export interface Chance {
  readonly cards: readonly Card[];
  readonly percent: number;
  readonly seat: SeatIndex;
}

export interface Share {
  readonly amount: number;
  readonly seat: SeatIndex;
}

export type ReplayStep = Data.TaggedEnum<{
  Acted: {
    readonly act: Act;
    readonly added: number;
    readonly allIn: boolean;
    readonly at: number;
    readonly seat: SeatIndex;
    readonly to: number;
  };
  Awarded: {
    readonly at: number;
    readonly pot: number;
    readonly run: number;
    readonly shares: readonly Share[];
  };
  Dealt: { readonly at: number; readonly seats: readonly SeatIndex[] };
  Gathered: { readonly at: number; readonly pot: number };
  Mucked: { readonly at: number; readonly seat: SeatIndex };
  Odds: {
    readonly at: number;
    readonly board: readonly Card[];
    readonly chances: readonly Chance[];
  };
  Posted: {
    readonly allIn: boolean;
    readonly amount: number;
    readonly at: number;
    readonly post: Post;
    readonly seat: SeatIndex;
  };
  Returned: {
    readonly amount: number;
    readonly at: number;
    readonly seat: SeatIndex;
  };
  Runs: { readonly at: number; readonly runs: number };
  Shown: {
    readonly at: number;
    readonly cards: readonly Card[];
    readonly seat: SeatIndex;
  };
  StreetDealt: {
    readonly at: number;
    readonly cards: readonly Card[];
    readonly run: number;
    readonly street: Street;
  };
}>;

export const ReplaySteps = Data.taggedEnum<ReplayStep>();

export interface Replay {
  readonly bigBlind: number;
  readonly bigBlindSeat: SeatIndex;
  readonly button: SeatIndex;
  readonly dealtIn: readonly SeatIndex[];
  readonly handNumber: number;
  readonly smallBlindSeat: SeatIndex;
  readonly steps: readonly ReplayStep[];
}

const HOLE_CARDS = 2;

const FULL_BOARD = 5;

interface Telling {
  readonly bets: Map<SeatIndex, number>;
  readonly dealt: { done: boolean };
  readonly pot: { collected: number };
  readonly shown: Map<SeatIndex, readonly Card[]>;
}

type Told = readonly ReplayStep[];

const NOTHING: Told = [];

const streetTotal = (telling: Telling) => {
  let total = 0;

  for (const amount of telling.bets.values()) {
    total += amount;
  }

  return total;
};

const committed = (telling: Telling, seat: SeatIndex, amount: number) => {
  const to = (telling.bets.get(seat) ?? 0) + amount;

  telling.bets.set(seat, to);

  return to;
};

const gathered = (telling: Telling, at: number): Told => {
  const street = streetTotal(telling);

  if (street === 0) {
    return NOTHING;
  }

  telling.pot.collected += street;
  telling.bets.clear();

  return [ReplaySteps.Gathered({ at, pot: telling.pot.collected })];
};

const shownBy = (
  telling: Telling,
  at: number,
  seat: SeatIndex,
  cards: readonly Card[]
): Told => {
  const held = telling.shown.get(seat) ?? [];

  const now = [...held, ...cards.filter((card) => !held.includes(card))].slice(
    0,
    HOLE_CARDS
  );

  if (now.length === held.length) {
    return NOTHING;
  }

  telling.shown.set(seat, now);

  return [ReplaySteps.Shown({ at, cards: now, seat })];
};

const posted = (
  telling: Telling,
  step: {
    readonly allIn: boolean;
    readonly amount: number;
    readonly at: number;
    readonly post: Post;
    readonly seat: SeatIndex;
  }
): Told => {
  if (step.post === "Ante" || step.post === "Dead") {
    telling.pot.collected += step.amount;
  } else {
    committed(telling, step.seat, step.amount);
  }

  return [ReplaySteps.Posted(step)];
};

const blindPost = (blind: "Big" | "Small", dead: boolean | undefined): Post => {
  if (dead === true) {
    return "Dead";
  }

  return blind;
};

const acted = (
  telling: Telling,
  at: number,
  seat: SeatIndex,
  act: "Check" | "Fold"
): Told => [
  ReplaySteps.Acted({
    act,
    added: 0,
    allIn: false,
    at,
    seat,
    to: telling.bets.get(seat) ?? 0,
  }),
];

const showdownOf = (
  telling: Telling,
  at: number,
  order: readonly ShowdownEntry[]
): Told => [
  ...gathered(telling, at),
  ...order.flatMap((entry) => {
    if (ShowdownEntries.$is("Shown")(entry)) {
      return shownBy(telling, at, entry.seat, entry.cards);
    }

    return telling.shown.has(entry.seat)
      ? NOTHING
      : [ReplaySteps.Mucked({ at, seat: entry.seat })];
  }),
];

const awarded = (
  telling: Telling,
  at: number,
  award: {
    readonly amount: number;
    readonly pot: number;
    readonly run: number;
    readonly winners: readonly Share[];
  }
): Told => {
  const before = gathered(telling, at);

  telling.pot.collected = Math.max(0, telling.pot.collected - award.amount);

  return [
    ...before,
    ReplaySteps.Awarded({
      at,
      pot: award.pot,
      run: award.run,
      shares: award.winners.map((winner) => ({
        amount: winner.amount,
        seat: winner.seat,
      })),
    }),
  ];
};

const raised = (
  telling: Telling,
  at: number,
  raise: {
    readonly added: number;
    readonly allIn: boolean;
    readonly seat: SeatIndex;
    readonly to: number;
  }
): Told => {
  const facing = Math.max(0, ...telling.bets.values()) > 0;

  committed(telling, raise.seat, raise.added);

  return [
    ReplaySteps.Acted({
      act: facing ? "Raise" : "Bet",
      added: raise.added,
      allIn: raise.allIn,
      at,
      seat: raise.seat,
      to: raise.to,
    }),
  ];
};

const dealtOnce = (telling: Telling, at: number): Told => {
  if (telling.dealt.done) {
    return NOTHING;
  }

  telling.dealt.done = true;

  return [ReplaySteps.Dealt({ at, seats: [] })];
};

const tell = (telling: Telling, event: SeenTableEvent, at: number): Told =>
  Match.value(event).pipe(
    Match.tagsExhaustive({
      AntePosted: ({ allIn, amount, seat }) =>
        posted(telling, { allIn, amount, at, post: "Ante", seat }),
      BlindPosted: ({ allIn, amount, blind, dead, seat }) =>
        posted(telling, {
          allIn,
          amount,
          at,
          post: blindPost(blind, dead),
          seat,
        }),
      BountyPaid: () => NOTHING,
      Called: ({ allIn, amount, seat }) => [
        ReplaySteps.Acted({
          act: "Call",
          added: amount,
          allIn,
          at,
          seat,
          to: committed(telling, seat, amount),
        }),
      ],
      CardsShown: ({ cards, seat }) => shownBy(telling, at, seat, cards),
      Checked: ({ seat }) => acted(telling, at, seat, "Check"),
      ChipsAdded: () => NOTHING,
      Folded: ({ seat }) => acted(telling, at, seat, "Fold"),
      HandEnded: () => gathered(telling, at),
      HandMucked: ({ seat }) => [ReplaySteps.Mucked({ at, seat })],
      HandStarted: () => NOTHING,
      HandTabled: ({ cards, seat }) => [
        ...gathered(telling, at),
        ...shownBy(telling, at, seat, cards),
      ],
      HandsTabled: ({ hands }) => [
        ...gathered(telling, at),
        ...hands.flatMap(({ cards, seat }) =>
          shownBy(telling, at, seat, cards)
        ),
      ],
      HoleCardsDealt: () => dealtOnce(telling, at),
      PlayerSat: () => NOTHING,
      PlayerStood: () => NOTHING,
      PotAwarded: (award) => awarded(telling, at, award),
      RabbitHunted: () => NOTHING,
      RaisedTo: ({ added, allIn, seat, to }) =>
        raised(telling, at, { added, allIn, seat, to }),
      RulesChanged: () => NOTHING,
      RunsAgreed: ({ runs }) => [
        ...gathered(telling, at),
        ReplaySteps.Runs({ at, runs }),
      ],
      RunsChosen: () => NOTHING,
      ShowdownReached: ({ order }) => showdownOf(telling, at, order),
      ShowdownStarted: () => gathered(telling, at),
      SittingOutChanged: () => NOTHING,
      StraddlePosted: ({ amount, seat }) =>
        posted(telling, { allIn: false, amount, at, post: "Straddle", seat }),
      StreetDealt: ({ cards, run, street }) => [
        ...gathered(telling, at),
        ReplaySteps.StreetDealt({ at, cards, run, street }),
      ],
      UncalledBetReturned: ({ amount, seat }) => {
        telling.bets.set(
          seat,
          Math.max(0, (telling.bets.get(seat) ?? 0) - amount)
        );

        return [ReplaySteps.Returned({ amount, at, seat })];
      },
    })
  );

const contendersOf = (story: HandStory, dealtIn: readonly SeatIndex[]) =>
  dealtIn.filter((seat) => !story.folded.includes(seat));

const oddsOf = (
  story: HandStory,
  dealtIn: readonly SeatIndex[],
  steps: readonly ReplayStep[]
): Option.Option<ReplayStep> => {
  const contenders = contendersOf(story, dealtIn);
  const holes = contenders.map((seat) => story.shown[seat] ?? []);

  if (contenders.length < 2 || holes.some((hole) => hole.length < HOLE_CARDS)) {
    return Option.none();
  }

  const moneyIn = moneyInBoard(story, contenders);
  const [board = []] = story.boards;

  if (moneyIn >= FULL_BOARD) {
    return Option.none();
  }

  const seen = steps.filter(
    (step) =>
      ReplaySteps.$is("Shown")(step) &&
      contenders.includes(step.seat) &&
      step.cards.length === HOLE_CARDS
  );

  const at = Math.max(...seen.map((step) => step.at));
  const equity = equities(holes, board.slice(0, moneyIn));

  return Option.some(
    ReplaySteps.Odds({
      at,
      board: board.slice(0, moneyIn),
      chances: contenders.map((seat, index) => ({
        cards: holes[index] ?? [],
        percent: percentOf(equity, index),
        seat,
      })),
    })
  );
};

const withOdds = (
  steps: readonly ReplayStep[],
  odds: Option.Option<ReplayStep>
): readonly ReplayStep[] =>
  Option.match(odds, {
    onNone: () => steps,
    onSome: (step) => {
      const after = steps.findLastIndex((each) => each.at <= step.at);

      return [...steps.slice(0, after + 1), step, ...steps.slice(after + 1)];
    },
  });

export const replayOf = (
  record: readonly SeenTableEvent[]
): Option.Option<Replay> => {
  const [first] = record;

  if (first === undefined || !Events.$is("HandStarted")(first)) {
    return Option.none();
  }

  return storyOf(record).pipe(
    Option.map((story) => {
      const telling: Telling = {
        bets: new Map(),
        dealt: { done: false },
        pot: { collected: 0 },
        shown: new Map(),
      };

      const told = record.flatMap((event, at) => tell(telling, event, at));

      const steps = told.map((step) =>
        ReplaySteps.$is("Dealt")(step)
          ? ReplaySteps.Dealt({ at: step.at, seats: first.dealtIn })
          : step
      );

      return {
        bigBlind: story.bigBlind,
        bigBlindSeat: first.bigBlindSeat,
        button: first.button,
        dealtIn: first.dealtIn,
        handNumber: first.handNumber,
        smallBlindSeat: first.smallBlindSeat,
        steps: withOdds(steps, oddsOf(story, first.dealtIn, steps)),
      };
    })
  );
};

export const cardsRevealedBy = (step: ReplayStep): readonly Card[] =>
  ReplaySteps.$match(step, {
    Acted: () => [],
    Awarded: () => [],
    Dealt: () => [],
    Gathered: () => [],
    Mucked: () => [],
    Odds: ({ board, chances }) => [
      ...board,
      ...chances.flatMap((chance) => chance.cards),
    ],
    Posted: () => [],
    Returned: () => [],
    Runs: () => [],
    Shown: ({ cards }) => cards,
    StreetDealt: ({ cards }) => cards,
  });
