import { cardText, describe, evaluate, rankOf } from "@nostakes/engine";
import type { Card, HandCategory, SeatIndex } from "@nostakes/engine";
import { ReplaySteps } from "@nostakes/room";
import type { MomentKind, Replay, ReplayStep } from "@nostakes/room";

import { chipsText } from "../captions.js";
import type { ReplaySeat } from "../replay-plan.js";
import { shortName } from "../replay-words.js";
import type { Outcome } from "../sound/sheet.js";

export interface DriftPerson {
  readonly avatar: string;
  readonly hole: readonly string[];
  readonly name: string;
  readonly seat: SeatIndex;
}

export interface DriftOdds {
  readonly lead: number;
  readonly other: number;
}

export interface CardItem {
  readonly card: string;
  readonly kind: "Card";
  readonly made: string;
  readonly odds: DriftOdds | null;
  readonly run: number;
  readonly slot: number;
}

export interface ActItem {
  readonly amount: number;
  readonly kind: "Act";
  readonly seat: SeatIndex;
  readonly word: string;
}

export interface NoteItem {
  readonly kind: "Note";
  readonly small: string;
  readonly word: string;
}

export type DriftItem = ActItem | CardItem | NoteItem;

export interface DriftReveal {
  readonly seat: SeatIndex;
  readonly word: string;
}

export type DriftDecisive =
  | {
      readonly before: DriftOdds | null;
      readonly gainer: SeatIndex;
      readonly item: CardItem;
      readonly kind: "Card";
      readonly split: boolean;
      readonly victim: SeatIndex;
      readonly word: string;
    }
  | {
      readonly actor: SeatIndex;
      readonly amount: number;
      readonly kind: "Call" | "Fold";
      readonly reveal: DriftReveal;
    }
  | { readonly kind: "None"; readonly word: string };

export interface DriftHook {
  readonly big: string;
  readonly seat: SeatIndex;
  readonly small: string;
}

export interface DriftTold {
  readonly after: readonly DriftItem[];
  readonly build: readonly DriftItem[];
  readonly commons: number;
  readonly decisive: DriftDecisive;
  readonly hook: readonly DriftHook[];
  readonly lead: DriftPerson;
  readonly numbers: boolean;
  readonly other: DriftPerson | null;
  readonly bounty: { readonly amount: number; readonly seat: SeatIndex } | null;
  readonly outcome: Outcome;
  readonly payoff: readonly {
    readonly amount: number;
    readonly seat: SeatIndex;
  }[];
  readonly people: readonly DriftPerson[];
  readonly runs: number;
}

export interface DriftFacts {
  readonly kind: MomentKind;
  readonly principals: readonly SeatIndex[];
  readonly seats: readonly ReplaySeat[];
  readonly title: string;
}

type StepOf<Tag extends ReplayStep["_tag"]> = Extract<
  ReplayStep,
  { _tag: Tag }
>;

const HOLE_CARDS = 2;

const FLOP_CARDS = 3;

const SWING_POINTS = 20;

const LOUD_SHARE = 4;

const MOST_ACTS = 2;

const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

const MADE: Readonly<Record<HandCategory, string>> = {
  Flush: "FLUSH",
  FourOfAKind: "QUADS",
  FullHouse: "FULL HOUSE",
  HighCard: "NO PAIR",
  OnePair: "PAIR",
  RoyalFlush: "ROYAL FLUSH",
  Straight: "STRAIGHT",
  StraightFlush: "STRAIGHT FLUSH",
  ThreeOfAKind: "TRIPS",
  TwoPair: "TWO PAIR",
};

const ALIKE = ["", "", "PAIR", "TRIPS", "QUADS"];

const rankSign = (card: Card) => RANKS[rankOf(card)] ?? "?";

export const startingWord = (hole: readonly Card[]) => {
  const [high, low] = hole.toSorted(
    (left, right) => rankOf(right) - rankOf(left)
  );

  if (high === undefined || low === undefined) {
    return "";
  }

  return rankOf(high) === rankOf(low)
    ? `POCKET ${rankSign(high)}S`
    : `${rankSign(high)} HIGH`;
};

export const madeWord = (hole: readonly Card[], board: readonly Card[]) => {
  if (board.length >= FLOP_CARDS) {
    return MADE[describe(evaluate([...hole, ...board])).category];
  }

  const most = Math.max(
    0,
    ...hole.map(
      (held) =>
        [...hole, ...board].filter((card) => rankOf(card) === rankOf(held))
          .length
    )
  );

  return ALIKE[most] ?? "";
};

const percentOf = (step: StepOf<"Odds">, seat: SeatIndex | null) =>
  step.chances.find((chance) => chance.seat === seat)?.percent;

const oddsOf = (
  step: StepOf<"Odds"> | undefined,
  lead: SeatIndex,
  other: SeatIndex | null
): DriftOdds | null => {
  if (step === undefined) {
    return null;
  }

  const mine = percentOf(step, lead);
  const theirs = percentOf(step, other);

  return mine === undefined || theirs === undefined
    ? null
    : { lead: mine, other: theirs };
};

const otherOf = (replay: Replay, facts: DriftFacts, lead: SeatIndex) => {
  const [, named] = facts.principals;

  if (named !== undefined && named !== lead) {
    return named;
  }

  const folded = replay.steps
    .filter(ReplaySteps.$is("Acted"))
    .filter((step) => step.act === "Fold")
    .map((step) => step.seat);

  const still = replay.dealtIn.filter(
    (seat) => seat !== lead && !folded.includes(seat)
  );

  return (
    still.find((seat) => replay.tabled.some((each) => each.seat === seat)) ??
    still[0] ??
    folded.findLast((seat) => seat !== lead) ??
    null
  );
};

const winnersOf = (replay: Replay) => {
  const winners = new Map<number, SeatIndex[]>();

  for (const step of replay.steps) {
    if (ReplaySteps.$is("Awarded")(step)) {
      winners.set(step.run, [
        ...new Set([
          ...(winners.get(step.run) ?? []),
          ...step.shares.map((share) => share.seat),
        ]),
      ]);
    }
  }

  return winners;
};

interface Told {
  readonly at: number;
  readonly item: DriftItem;
}

interface ToldCard {
  readonly at: number;
  readonly item: CardItem;
  readonly raw: Card;
}

interface Reading {
  readonly cards: readonly ToldCard[];
  readonly commons: number;
  readonly loose: readonly {
    readonly at: number;
    readonly board: number;
    readonly odds: DriftOdds;
    readonly run: number;
  }[];
  readonly runs: number;
}

const WITHIN_STEP = 0.1;

const boardsRead = (
  replay: Replay,
  lead: SeatIndex,
  other: SeatIndex | null
): Reading => {
  const hole = replay.tabled.find((each) => each.seat === lead)?.cards ?? [];
  const boards = new Map<number, Card[]>();
  const dealt = new Map<number, number>();
  const cards: ToldCard[] = [];
  let runs = 1;
  let commons = 0;

  for (const [index, step] of replay.steps.entries()) {
    if (ReplaySteps.$is("Runs")(step)) {
      ({ runs } = step);
      commons = runs > 1 ? (dealt.get(1) ?? 0) : 0;
    } else if (ReplaySteps.$is("StreetDealt")(step)) {
      const next = replay.steps.findIndex(
        (each, at) => at > index && !ReplaySteps.$is("Odds")(each)
      );

      const odds = replay.steps
        .slice(index + 1, next === -1 ? replay.steps.length : next)
        .filter(ReplaySteps.$is("Odds"));

      for (const [place, card] of step.cards.entries()) {
        const own = dealt.get(step.run) ?? 0;
        const slot = step.run === 1 ? own : own + commons;

        const board = [
          ...(boards.get(step.run) ?? (boards.get(1) ?? []).slice(0, commons)),
          card,
        ];

        boards.set(step.run, board);
        dealt.set(step.run, own + 1);
        cards.push({
          at: index + place * WITHIN_STEP,
          item: {
            card: cardText(card),
            kind: "Card",
            made:
              hole.length === HOLE_CARDS
                ? madeWord(hole, board) || startingWord(hole)
                : "",
            odds: oddsOf(
              odds.find(
                (each) =>
                  each.run === step.run &&
                  each.board.length === slot + 1 &&
                  each.board.at(-1) === card
              ),
              lead,
              other
            ),
            run: step.run,
            slot,
          },
          raw: card,
        });
      }
    }
  }

  return {
    cards,
    commons,
    loose: replay.steps.flatMap((step, at) => {
      const found = ReplaySteps.$is("Odds")(step)
        ? oddsOf(step, lead, other)
        : null;

      return found === null || !ReplaySteps.$is("Odds")(step)
        ? []
        : [{ at, board: step.board.length, odds: found, run: step.run }];
    }),
    runs,
  };
};

const oddsBefore = (reading: Reading, told: ToldCard): DriftOdds | null => {
  const { item } = told;

  const alike = (run: number, slot: number) =>
    run === item.run || slot <= reading.commons;

  const dealt = reading.cards.findLast(
    (each) =>
      each.item.odds !== null &&
      each.item.slot < item.slot &&
      alike(each.item.run, each.item.slot + 1)
  );

  const loose = reading.loose.findLast(
    (each) =>
      each.at < Math.floor(told.at) &&
      each.board === item.slot &&
      alike(each.run, each.board)
  );

  return loose !== undefined && loose.at > (dealt?.at ?? -1)
    ? loose.odds
    : (dealt?.item.odds ?? null);
};

const boardUpTo = (reading: Reading, item: CardItem): readonly Card[] =>
  reading.cards
    .filter(
      (each) =>
        each.item.slot <= item.slot &&
        (each.item.run === item.run || each.item.slot < reading.commons)
    )
    .map((each) => each.raw);

const ACT_WORDS = {
  Bet: "BET",
  Call: "CALL",
  Check: "CHECK",
  Fold: "FOLD",
  Raise: "RAISE",
} as const;

const actItem = (step: StepOf<"Acted">): ActItem => ({
  amount: step.act === "Call" ? step.added : step.to,
  kind: "Act",
  seat: step.seat,
  word: step.allIn && step.act !== "Call" ? "ALL IN" : ACT_WORDS[step.act],
});

const loudActs = (
  replay: Replay,
  within: (at: number) => boolean
): readonly Told[] => {
  const wagers = replay.steps.flatMap((step, at) =>
    ReplaySteps.$is("Acted")(step) &&
    within(at) &&
    step.act !== "Fold" &&
    step.act !== "Check"
      ? [{ at, step }]
      : []
  );

  const biggest = Math.max(0, ...wagers.map((each) => each.step.to));
  const allIns = wagers.filter((each) => each.step.allIn);

  const others = wagers
    .filter((each) => !each.step.allIn && each.step.to * LOUD_SHARE >= biggest)
    .slice(-Math.max(0, MOST_ACTS - allIns.length));

  return [...allIns, ...(allIns.length < MOST_ACTS ? others : [])]
    .toSorted((left, right) => left.at - right.at)
    .map((each) => ({ at: each.at, item: actItem(each.step) }));
};

interface Swing {
  readonly at: number;
  readonly before: DriftOdds | null;
  readonly gain: number;
  readonly gainer: SeatIndex;
  readonly item: CardItem;
  readonly victim: SeatIndex;
}

const swingOf = (
  reading: Reading,
  seats: { readonly lead: SeatIndex; readonly other: SeatIndex | null },
  start: DriftOdds | null,
  winners: ReadonlyMap<number, readonly SeatIndex[]>
): Swing | null => {
  const { lead, other } = seats;
  let best: Swing | null = null;

  if (other === null) {
    return null;
  }

  for (const told of reading.cards) {
    const { item } = told;

    const earlier = oddsBefore(reading, told) ?? start;

    const won = winners.get(item.run) ?? [];

    if (item.odds !== null && earlier !== null) {
      const gains = [
        { gain: item.odds.lead - earlier.lead, gainer: lead, victim: other },
        { gain: item.odds.other - earlier.other, gainer: other, victim: lead },
      ];

      for (const each of gains) {
        if (
          each.gain >= SWING_POINTS &&
          won.includes(each.gainer) &&
          !won.includes(each.victim) &&
          (best === null || each.gain >= best.gain)
        ) {
          best = { ...each, at: told.at, before: earlier, item };
        }
      }
    }
  }

  return best;
};

const person = (
  replay: Replay,
  facts: DriftFacts,
  seat: SeatIndex
): DriftPerson => {
  const found = facts.seats.find((each) => each.seat === seat);

  const shown = (
    replay.tabled.find((each) => each.seat === seat)?.cards ?? []
  ).map(cardText);

  return {
    avatar: found?.avatar ?? "",
    hole: [
      ...shown,
      ...Array.from({ length: HOLE_CARDS - shown.length }, () => ""),
    ],
    name: shortName(found?.name ?? "Someone").toUpperCase(),
    seat,
  };
};

const outcomeOf = (
  winners: readonly SeatIndex[],
  lead: SeatIndex,
  painful: boolean
): Outcome => {
  if (winners.length > 1) {
    return "Split";
  }

  return winners.includes(lead) && !painful ? "Win" : "Loss";
};

const PAINFUL: ReadonlySet<MomentKind> = new Set(["BadBeat", "Cooler"]);

const lastBet = (replay: Replay, before: number) => {
  const found = replay.steps
    .slice(0, before)
    .findLast(
      (step) =>
        ReplaySteps.$is("Acted")(step) &&
        (step.act === "Bet" || step.act === "Raise")
    );

  return found !== undefined && ReplaySteps.$is("Acted")(found) ? found : null;
};

interface Turn {
  readonly cut: number;
  readonly decisive: DriftDecisive;
}

interface Seats {
  readonly lead: SeatIndex;
  readonly other: SeatIndex | null;
}

interface Read {
  readonly dealt: DriftOdds | null;
  readonly reading: Reading;
  readonly replay: Replay;
  readonly seats: Seats;
  readonly tabled: ReadonlyMap<SeatIndex, readonly Card[]>;
  readonly winners: ReadonlyMap<number, readonly SeatIndex[]>;
}

const swingTurn = (read: Read): Turn | null => {
  const swing = swingOf(read.reading, read.seats, read.dealt, read.winners);

  return swing === null
    ? null
    : {
        cut: swing.at,
        decisive: {
          before: swing.before,
          gainer: swing.gainer,
          item: swing.item,
          kind: "Card",
          split: false,
          victim: swing.victim,
          word: madeWord(
            read.tabled.get(swing.gainer) ?? [],
            boardUpTo(read.reading, swing.item)
          ),
        },
      };
};

const revealOf = (read: Read, seat: SeatIndex): DriftReveal => {
  const last = read.reading.cards.at(-1)?.item;
  const hole = read.tabled.get(seat) ?? [];

  return {
    seat,
    word:
      hole.length === HOLE_CARDS
        ? madeWord(
            hole,
            last === undefined ? [] : boardUpTo(read.reading, last)
          )
        : "",
  };
};

const foldTurn = (read: Read): Turn | null => {
  const { replay, seats } = read;

  const fold = replay.steps.findLastIndex(
    (step) => ReplaySteps.$is("Acted")(step) && step.act === "Fold"
  );

  const folded = replay.steps[fold];

  if (folded === undefined || !ReplaySteps.$is("Acted")(folded)) {
    return null;
  }

  const bet = lastBet(replay, fold);

  return {
    cut: fold,
    decisive: {
      actor: folded.seat,
      amount: bet === null ? 0 : bet.to - folded.to,
      kind: "Fold",
      reveal: revealOf(read, seats.lead),
    },
  };
};

const callTurn = (read: Read): Turn | null => {
  const { replay, seats } = read;

  const call = replay.steps.findLastIndex(
    (step) =>
      ReplaySteps.$is("Acted")(step) &&
      step.act === "Call" &&
      step.seat === seats.lead
  );

  const called = replay.steps[call];
  const bet = lastBet(replay, call);

  if (
    called === undefined ||
    !ReplaySteps.$is("Acted")(called) ||
    bet === null
  ) {
    return null;
  }

  return {
    cut: call,
    decisive: {
      actor: called.seat,
      amount: called.added,
      kind: "Call",
      reveal: revealOf(read, bet.seat),
    },
  };
};

const riverTurn = (read: Read): Turn | null => {
  const { reading, seats } = read;
  const final = reading.cards.at(-1);
  const [winner] = read.winners.get(final?.item.run ?? 1) ?? [];

  if (final === undefined || winner === undefined || seats.other === null) {
    return null;
  }

  return {
    cut: final.at,
    decisive: {
      before: oddsBefore(reading, final) ?? read.dealt,
      gainer: winner,
      item: final.item,
      kind: "Card",
      split: (read.winners.get(final.item.run) ?? []).length > 1,
      victim: winner === seats.lead ? seats.other : seats.lead,
      word: madeWord(
        read.tabled.get(winner) ?? [],
        boardUpTo(reading, final.item)
      ),
    },
  };
};

const turnOf = (facts: DriftFacts, read: Read): Turn => {
  const unseen =
    (read.tabled.get(read.seats.other ?? read.seats.lead) ?? []).length === 0;

  const folds = facts.kind === "Bluff" || unseen;

  return (
    (facts.kind === "HeroCall" ? callTurn(read) : null) ??
    (folds || facts.kind === "SameHand" ? null : swingTurn(read)) ??
    (folds ? foldTurn(read) : null) ??
    riverTurn(read) ?? {
      cut: read.replay.steps.length,
      decisive: { kind: "None", word: facts.title.toUpperCase() },
    }
  );
};

const hookOf = (
  replay: Replay,
  facts: DriftFacts,
  seats: Seats & { readonly numbers: boolean }
): readonly DriftHook[] => {
  const { lead, other } = seats;

  const dealt = seats.numbers
    ? oddsOf(
        replay.steps
          .filter(ReplaySteps.$is("Odds"))
          .find((step) => step.board.length === 0),
        lead,
        other
      )
    : null;

  const order =
    dealt !== null && dealt.other > dealt.lead ? [other, lead] : [lead, other];

  const wordOf = (seat: SeatIndex | null) => {
    const held = replay.tabled.find((each) => each.seat === seat)?.cards ?? [];

    return held.length === HOLE_CARDS ? startingWord(held) : "";
  };

  return order.flatMap((seat, place): readonly DriftHook[] => {
    if (seat === null) {
      return [];
    }

    const { name } = person(replay, facts, seat);

    if (dealt !== null) {
      return [
        {
          big: `${seat === lead ? dealt.lead : dealt.other}%`,
          seat,
          small: `${name} TO WIN`,
        },
      ];
    }

    const word = wordOf(seat);

    if (word.length === 0) {
      return [{ big: name, seat, small: place === 0 ? "" : "VS" }];
    }

    return [
      {
        big: word,
        seat,
        small:
          place === 1 && word === wordOf(order[0] ?? null)
            ? `SO DOES ${name}`
            : `${name} HAS`,
      },
    ];
  });
};

export const driftTold = (replay: Replay, facts: DriftFacts): DriftTold => {
  const lead = facts.principals[0] ?? replay.dealtIn[0] ?? replay.button;
  const other = otherOf(replay, facts, lead);
  const reading = boardsRead(replay, lead, other);

  const { cut, decisive } = turnOf(facts, {
    dealt: oddsOf(
      replay.steps
        .filter(ReplaySteps.$is("Odds"))
        .find((step) => step.board.length === 0),
      lead,
      other
    ),
    reading,
    replay,
    seats: { lead, other },
    tabled: new Map(replay.tabled.map((each) => [each.seat, each.cards])),
    winners: winnersOf(replay),
  });

  const everything: readonly Told[] = [
    ...reading.cards,
    ...loudActs(replay, (at) => at < cut),
    ...loudActs(replay, (at) => at > cut),
    ...replay.steps.flatMap((step, at): readonly Told[] =>
      ReplaySteps.$is("Runs")(step) && step.runs > 1
        ? [
            {
              at,
              item: {
                kind: "Note",
                small: "THEY RUN IT",
                word: step.runs === 2 ? "TWICE" : `${step.runs} TIMES`,
              },
            },
          ]
        : []
    ),
    ...(replay.bombAnte === null
      ? []
      : [
          {
            at: -1,
            item: {
              kind: "Note" as const,
              small: `EVERYONE ANTES ${chipsText(replay.bombAnte)}`,
              word: "BOMB POT",
            },
          },
        ]),
  ].toSorted((left, right) => left.at - right.at);

  const shares = new Map<SeatIndex, number>();

  for (const step of replay.steps) {
    if (ReplaySteps.$is("Awarded")(step)) {
      for (const share of step.shares) {
        shares.set(share.seat, (shares.get(share.seat) ?? 0) + share.amount);
      }
    }
  }

  const paid = replay.steps.find(ReplaySteps.$is("Bounty"));
  const numbers = decisive.kind === "Card" && !decisive.split;

  return {
    after: everything.flatMap((told) => (told.at > cut ? [told.item] : [])),
    bounty:
      paid === undefined
        ? null
        : {
            amount: paid.payers.reduce((sum, payer) => sum + payer.amount, 0),
            seat: paid.seat,
          },
    build: everything.flatMap((told) => (told.at < cut ? [told.item] : [])),
    commons: reading.commons,
    decisive,
    hook: hookOf(replay, facts, { lead, numbers, other }),
    lead: person(replay, facts, lead),
    numbers,
    other: other === null ? null : person(replay, facts, other),
    outcome: outcomeOf([...shares.keys()], lead, PAINFUL.has(facts.kind)),
    payoff: [...shares.entries()].map(([seat, amount]) => ({ amount, seat })),
    people: replay.dealtIn.map((seat) => person(replay, facts, seat)),
    runs: reading.runs,
  };
};
