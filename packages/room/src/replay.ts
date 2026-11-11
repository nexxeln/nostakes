import {
  CardSchema,
  DECK_SIZE,
  Events,
  ShowdownEntries,
  evaluate,
} from "@nostakes/engine";
import type { Card, SeatIndex, ShowdownEntry, Street } from "@nostakes/engine";
import { Data, Match, Option } from "effect";

import { equities, percentOf } from "./equity.js";
import { storyOf } from "./hand-story.js";
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

export interface Tabled {
  readonly cards: readonly Card[];
  readonly seat: SeatIndex;
}

export interface Outs {
  readonly cards: readonly Card[];
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
  Bounty: {
    readonly at: number;
    readonly payers: readonly Share[];
    readonly seat: SeatIndex;
  };
  Dealt: { readonly at: number; readonly seats: readonly SeatIndex[] };
  Gathered: { readonly at: number; readonly pot: number };
  Mucked: { readonly at: number; readonly seat: SeatIndex };
  Odds: {
    readonly at: number;
    readonly board: readonly Card[];
    readonly chances: readonly Chance[];
    readonly outs: readonly Outs[];
    readonly run: number;
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
  readonly bombAnte: number | null;
  readonly bigBlindSeat: SeatIndex;
  readonly button: SeatIndex;
  readonly dealtIn: readonly SeatIndex[];
  readonly handNumber: number;
  readonly smallBlindSeat: SeatIndex;
  readonly steps: readonly ReplayStep[];
  readonly tabled: readonly Tabled[];
}

const HOLE_CARDS = 2;

const FLOP_CARDS = 3;

const FULL_BOARD = 5;

const DECK: readonly Card[] = Array.from({ length: DECK_SIZE }, (_, index) =>
  CardSchema.make(index)
);

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
      BountyPaid: ({ payers, seat }) => [
        ReplaySteps.Bounty({
          at,
          payers: payers.map((payer) => ({
            amount: payer.amount,
            seat: payer.seat,
          })),
          seat,
        }),
      ],
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

export interface OddsAsked {
  readonly board: readonly Card[];
  readonly holes: readonly (readonly Card[])[];
}

export type Chances = (asked: OddsAsked) => readonly number[];

export const tableChances: Chances = ({ board, holes }) => {
  const equity = equities(holes, board);

  return holes.map((_, index) => percentOf(equity, index));
};

interface OddsPoint {
  readonly at: number;
  readonly board: readonly Card[];
  readonly holes: readonly (readonly Card[])[];
  readonly run: number;
  readonly seats: readonly SeatIndex[];
}

const tabledOf = (
  story: HandStory,
  dealtIn: readonly SeatIndex[]
): readonly Tabled[] =>
  dealtIn.flatMap((seat) => {
    const cards = story.shown[seat] ?? [];

    return cards.length > 0 ? [{ cards, seat }] : [];
  });

const pointsOf = (
  record: readonly SeenTableEvent[],
  story: HandStory,
  dealtIn: readonly SeatIndex[]
): readonly OddsPoint[] => {
  const points: OddsPoint[] = [];
  const boards = new Map<number, readonly Card[]>([[1, []]]);
  let live = dealtIn;
  let dealt = false;

  const note = (at: number, run: number) => {
    const holes = live.map((seat) => story.shown[seat] ?? []);

    if (live.length >= 2 && holes.every((hole) => hole.length === HOLE_CARDS)) {
      points.push({
        at,
        board: boards.get(run) ?? [],
        holes,
        run,
        seats: live,
      });
    }
  };

  for (const [at, event] of record.entries()) {
    if (Events.$is("HoleCardsDealt")(event) && !dealt) {
      dealt = true;
      note(at, 1);
    } else if (Events.$is("Folded")(event)) {
      live = live.filter((seat) => seat !== event.seat);
      note(at, 1);
    } else if (Events.$is("RunsAgreed")(event)) {
      const common = boards.get(1) ?? [];

      for (let run = 2; run <= event.runs; run += 1) {
        boards.set(run, common);
      }
    } else if (Events.$is("StreetDealt")(event)) {
      for (const card of event.cards) {
        boards.set(event.run, [...(boards.get(event.run) ?? []), card]);
        note(at, event.run);
      }
    }
  }

  return points;
};

const aloneAhead = (ranks: readonly number[], index: number) =>
  ranks.every((rank, other) => other === index || rank < (ranks[index] ?? 0));

const outsOf = ({ board, holes, seats }: OddsPoint): readonly Outs[] => {
  if (board.length < FLOP_CARDS || board.length >= FULL_BOARD) {
    return [];
  }

  const seen = new Set([...holes.flat(), ...board]);
  const unseen = DECK.filter((card) => !seen.has(card));
  const now = holes.map((hole) => evaluate([...hole, ...board]));

  return seats.flatMap((seat, index) =>
    aloneAhead(now, index)
      ? []
      : [
          {
            cards: unseen.filter((card) =>
              aloneAhead(
                holes.map((hole) => evaluate([...hole, ...board, card])),
                index
              )
            ),
            seat,
          },
        ]
  );
};

const oddsOf = (point: OddsPoint, chances: Chances): ReplayStep => {
  const percents = chances({ board: point.board, holes: point.holes });

  return ReplaySteps.Odds({
    at: point.at,
    board: point.board,
    chances: point.seats.map((seat, index) => ({
      cards: point.holes[index] ?? [],
      percent: percents[index] ?? 0,
      seat,
    })),
    outs: outsOf(point),
    run: point.run,
  });
};

export const oddsAskedBy = (
  record: readonly SeenTableEvent[]
): readonly OddsAsked[] => {
  const [first] = record;

  return first === undefined || !Events.$is("HandStarted")(first)
    ? []
    : Option.match(storyOf(record), {
        onNone: () => [],
        onSome: (story) =>
          pointsOf(record, story, first.dealtIn).map(({ board, holes }) => ({
            board,
            holes,
          })),
      });
};

const withOdds = (
  steps: readonly ReplayStep[],
  odds: readonly ReplayStep[]
): readonly ReplayStep[] => {
  const merged: ReplayStep[] = [];
  let next = 0;

  for (const [index, step] of steps.entries()) {
    merged.push(step);

    const until = steps[index + 1]?.at ?? Number.POSITIVE_INFINITY;

    while (next < odds.length && (odds[next]?.at ?? until) < until) {
      const point = odds[next];

      if (point !== undefined) {
        merged.push(point);
      }

      next += 1;
    }
  }

  return merged;
};

export const replayOf = (
  record: readonly SeenTableEvent[],
  chances: Chances = tableChances
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
        bombAnte: first.bombPot?.ante ?? null,
        button: first.button,
        dealtIn: first.dealtIn,
        handNumber: first.handNumber,
        smallBlindSeat: first.smallBlindSeat,
        steps: withOdds(
          steps,
          pointsOf(record, story, first.dealtIn).map((point) =>
            oddsOf(point, chances)
          )
        ),
        tabled: tabledOf(story, first.dealtIn),
      };
    })
  );
};

export const cardsRevealedBy = (step: ReplayStep): readonly Card[] =>
  ReplaySteps.$match(step, {
    Acted: () => [],
    Awarded: () => [],
    Bounty: () => [],
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

export const cardsHeldBy = (replay: Replay): readonly Card[] => [
  ...replay.tabled.flatMap((tabled) => tabled.cards),
  ...replay.steps.flatMap(cardsRevealedBy),
];
