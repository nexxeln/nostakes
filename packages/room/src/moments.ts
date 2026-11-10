import {
  ChipsSchema,
  HandRankSchema,
  describe,
  evaluate,
  handCategory,
  rankOf,
  suitOf,
} from "@nostakes/engine";
import type {
  Card,
  Chips,
  HandCategory,
  HandRank,
  SeatIndex,
  Street,
} from "@nostakes/engine";
import { Data, Option } from "effect";

import { atLeast, atMost, equities, percentOf } from "./equity.js";
import type { Equity } from "./equity.js";
import {
  moneyInBoard,
  potTotal,
  shownHand,
  storyOf,
  winnersOf,
} from "./hand-story.js";
import type { HandStory, Wager } from "./hand-story.js";
import type { MomentCallouts } from "./settings.js";
import type { SeenTableEvent } from "./views.js";

export type Tier = 1 | 2 | 3;

export interface Odds {
  readonly exact: boolean;
  readonly percent: number;
}

interface Shared {
  readonly pot: Chips;
  readonly seats: readonly SeatIndex[];
  readonly tier: Tier;
}

export type Moment = Data.TaggedEnum<{
  BadBeat: Shared & {
    readonly odds: Odds;
    readonly rank: HandRank;
    readonly street: Street;
    readonly winningRank: HandRank;
  };
  BigHand: Shared & { readonly rank: HandRank };
  Bluff: Shared & { readonly bet: Chips; readonly street: Street };
  Cooler: Shared & {
    readonly rank: HandRank;
    readonly street: Street;
    readonly winningRank: HandRank;
  };
  HeroCall: Shared & {
    readonly call: Chips;
    readonly rank: HandRank;
    readonly street: Street;
  };
  SameHand: Shared & { readonly rank: HandRank };
  SevenDeuce: Shared & { readonly showdown: boolean };
  SplitRuns: Shared & { readonly runs: number };
  Suckout: Shared & { readonly odds: Odds; readonly street: Street };
}>;

export type MomentKind = Moment["_tag"];

export const Moments = Data.taggedEnum<Moment>();

export const MOMENT_KINDS: readonly MomentKind[] = [
  "BigHand",
  "BadBeat",
  "Cooler",
  "Suckout",
  "Bluff",
  "HeroCall",
  "SevenDeuce",
  "SameHand",
  "SplitRuns",
];

export const TIERS: Readonly<Record<MomentKind, readonly Tier[]>> = {
  BadBeat: [1, 2, 3],
  BigHand: [1, 2, 3],
  Bluff: [1, 2],
  Cooler: [1, 2, 3],
  HeroCall: [1, 2],
  SameHand: [1],
  SevenDeuce: [1],
  SplitRuns: [1],
  Suckout: [1, 2, 3],
};

export const MOST_MOMENTS = 3;

export const BIG_POT_BLINDS = 20;

export const REAL_BET_BLINDS = 10;

export const COOLER_STAKE_BLINDS = 40;

export const FAVOURITE_PERCENTS: readonly [number, number, number] = [
  80, 90, 95,
];

export const LONG_SHOT_PERCENTS: readonly [number, number, number] = [
  20, 10, 5,
];

const CATEGORY_ORDER: readonly HandCategory[] = [
  "HighCard",
  "OnePair",
  "TwoPair",
  "ThreeOfAKind",
  "Straight",
  "Flush",
  "FullHouse",
  "FourOfAKind",
  "StraightFlush",
  "RoyalFlush",
];

const BIG_HAND_TIERS: Readonly<Partial<Record<HandCategory, Tier>>> = {
  Flush: 1,
  FourOfAKind: 2,
  FullHouse: 1,
  RoyalFlush: 3,
  StraightFlush: 3,
};

const LOSING_HAND_TIERS: Readonly<Partial<Record<HandCategory, Tier>>> = {
  FourOfAKind: 3,
  FullHouse: 1,
  RoyalFlush: 3,
  StraightFlush: 3,
};

const COOLER_TIERS: Readonly<Partial<Record<HandCategory, Tier>>> = {
  FourOfAKind: 3,
  FullHouse: 2,
  RoyalFlush: 3,
  StraightFlush: 3,
};

const STREETS: readonly Street[] = [
  "Preflop",
  "Preflop",
  "Preflop",
  "Flop",
  "Turn",
  "River",
];

const SET_RANKED: ReadonlySet<HandCategory> = new Set([
  "ThreeOfAKind",
  "FourOfAKind",
]);

const QUEEN = 10;

const ACE = 12;

const SEVEN = 5;

const DEUCE = 0;

const FULL_BOARD = 5;

const FLOP = 3;

const FLUSH_LENGTH = 5;

const byNumber = (left: number, right: number) => left - right;

const strength = (category: HandCategory) => CATEGORY_ORDER.indexOf(category);

const streetOf = (board: number): Street => STREETS[board] ?? "Preflop";

const tierAtLeast = (left: Tier, right: Tier): Tier =>
  left >= right ? left : right;

const groupedCategory = (board: readonly Card[]): HandCategory => {
  const counts = new Map<number, number>();

  for (const card of board) {
    counts.set(rankOf(card), (counts.get(rankOf(card)) ?? 0) + 1);
  }

  const [most = 0, next = 0] = [...counts.values()].toSorted(
    (left, right) => right - left
  );

  if (most >= 4) {
    return "FourOfAKind";
  }

  if (most === 3) {
    return "ThreeOfAKind";
  }

  if (most === 2) {
    return next === 2 ? "TwoPair" : "OnePair";
  }

  return "HighCard";
};

export const boardCategory = (board: readonly Card[]): HandCategory =>
  board.length >= FULL_BOARD
    ? handCategory(evaluate(board))
    : groupedCategory(board);

const rankWith = (hole: readonly Card[], board: readonly Card[]) =>
  evaluate([...hole, ...board]);

const ownsMore = (hole: readonly Card[], board: readonly Card[]) =>
  strength(handCategory(rankWith(hole, board))) >
  strength(boardCategory(board));

export const nothingOfItsOwn = (
  hole: readonly Card[],
  board: readonly Card[]
) => {
  const rank = rankWith(hole, board);
  const category = handCategory(rank);

  if (strength(category) !== strength(boardCategory(board))) {
    return false;
  }

  return (
    strength(category) <= strength("ThreeOfAKind") ||
    board.length < FULL_BOARD ||
    rank === evaluate(board)
  );
};

const weakHold = (hole: readonly Card[], board: readonly Card[]) => {
  if (nothingOfItsOwn(hole, board)) {
    return true;
  }

  const rank = rankWith(hole, board);
  const [pair = ACE] = describe(rank).ranks;

  return (
    handCategory(rank) === "OnePair" &&
    pair < Math.max(...board.map((card) => rankOf(card)))
  );
};

const premiumPair = (hole: readonly Card[]) => {
  const [first, second] = hole.map((card) => rankOf(card));

  return first === second && (first ?? 0) >= QUEEN;
};

export const collide = (
  loser: readonly Card[],
  winner: readonly Card[],
  board: readonly Card[]
) => {
  if (board.length === 0) {
    return premiumPair(loser) && premiumPair(winner);
  }

  const lostRank = rankWith(loser, board);
  const wonRank = rankWith(winner, board);
  const lost = handCategory(lostRank);
  const won = handCategory(wonRank);
  const [lostTop] = describe(lostRank).ranks;
  const [wonTop] = describe(wonRank).ranks;
  const kickerBattle = SET_RANKED.has(lost) && lostTop === wonTop;

  return (
    ownsMore(loser, board) &&
    ownsMore(winner, board) &&
    strength(lost) >= strength("ThreeOfAKind") &&
    !kickerBattle &&
    (lost === won || strength(lost) >= strength("FullHouse"))
  );
};

const flushSuit = (cards: readonly Card[]) =>
  [0, 1, 2, 3].find(
    (suit) =>
      cards.filter((card) => suitOf(card) === suit).length >= FLUSH_LENGTH
  ) ?? -1;

export const isNutFlush = (hole: readonly Card[], board: readonly Card[]) => {
  const suit = flushSuit([...hole, ...board]);

  const onBoard = new Set(
    board.flatMap((card) => (suitOf(card) === suit ? [rankOf(card)] : []))
  );

  let top = ACE;

  while (onBoard.has(top)) {
    top -= 1;
  }

  return hole.some((card) => suitOf(card) === suit && rankOf(card) === top);
};

export const bigHandTier = (
  hole: readonly Card[],
  board: readonly Card[]
): Option.Option<Tier> => {
  if (board.length < FLOP || !ownsMore(hole, board)) {
    return Option.none();
  }

  const category = handCategory(rankWith(hole, board));

  if (category === "Flush" && !isNutFlush(hole, board)) {
    return Option.none();
  }

  return Option.fromUndefinedOr(BIG_HAND_TIERS[category]);
};

export const favouriteTier = (
  equity: Equity,
  index: number
): Option.Option<Tier> => {
  const [one, two, three] = FAVOURITE_PERCENTS;

  if (atLeast(equity, index, three)) {
    return Option.some(3);
  }

  if (atLeast(equity, index, two)) {
    return Option.some(2);
  }

  return atLeast(equity, index, one) ? Option.some(1) : Option.none();
};

export const longShotTier = (
  equity: Equity,
  index: number
): Option.Option<Tier> => {
  const [one, two, three] = LONG_SHOT_PERCENTS;

  if (atMost(equity, index, three)) {
    return Option.some(3);
  }

  if (atMost(equity, index, two)) {
    return Option.some(2);
  }

  return atMost(equity, index, one) ? Option.some(1) : Option.none();
};

const realBet = (wager: Wager, bigBlind: number) =>
  wager.added >= REAL_BET_BLINDS * bigBlind &&
  wager.added * 2 >= wager.potBefore;

const bigBet = (wager: Wager) => wager.allIn || wager.added >= wager.potBefore;

const chipsOf = (amount: number) => ChipsSchema.make(amount);

const lastRaise = (story: HandStory) => {
  const index = story.wagers.findLastIndex((wager) => wager.raise);

  return Option.fromUndefinedOr(story.wagers[index]).pipe(
    Option.map((wager) => ({ index, wager }))
  );
};

const bluffs = (story: HandStory, pot: Chips): readonly Moment[] => {
  const winners = winnersOf(story, 1);

  return Option.match(lastRaise(story), {
    onNone: () => [],
    onSome: ({ wager }) => {
      const board = story.common.slice(0, wager.board);

      const shown = shownHand(story, wager.seat).pipe(
        Option.filter(
          (hole) =>
            !story.showdown &&
            wager.board >= FLOP &&
            winners.length === 1 &&
            winners[0] === wager.seat &&
            realBet(wager, story.bigBlind) &&
            nothingOfItsOwn(hole, board)
        )
      );

      return Option.isSome(shown)
        ? [
            Moments.Bluff({
              bet: chipsOf(wager.added),
              pot,
              seats: [wager.seat],
              street: streetOf(wager.board),
              tier: bigBet(wager) ? 2 : 1,
            }),
          ]
        : [];
    },
  });
};

const mainResults = (story: HandStory) =>
  story.results.filter((result) => result.pot === 1);

const mainWinners = (story: HandStory, run: number) =>
  mainResults(story)
    .filter((result) => result.run === run)
    .flatMap((result) => result.winners);

const heroCalls = (story: HandStory, pot: Chips): readonly Moment[] => {
  if (!story.showdown || story.boards.length !== 1) {
    return [];
  }

  return Option.match(lastRaise(story), {
    onNone: () => [],
    onSome: ({ index, wager }) => {
      const board = story.common.slice(0, wager.board);
      const winners = mainWinners(story, 1);
      const bettor = shownHand(story, wager.seat);

      if (
        wager.board < FLOP ||
        winners.includes(wager.seat) ||
        !realBet(wager, story.bigBlind) ||
        !Option.exists(bettor, (hole) => nothingOfItsOwn(hole, board))
      ) {
        return [];
      }

      const bettorRank = Option.match(bettor, {
        onNone: () => 0,
        onSome: (hole) => rankWith(hole, board),
      });

      return story.wagers.slice(index + 1).flatMap((call) =>
        Option.match(shownHand(story, call.seat), {
          onNone: () => [],
          onSome: (hole) =>
            !call.raise &&
            winners.includes(call.seat) &&
            weakHold(hole, board) &&
            rankWith(hole, board) >= bettorRank
              ? [
                  Moments.HeroCall({
                    call: chipsOf(call.added),
                    pot,
                    rank: rankWith(hole, story.boards[0] ?? story.common),
                    seats: [call.seat, wager.seat],
                    street: streetOf(wager.board),
                    tier: call.allIn || bigBet(wager) ? 2 : 1,
                  }),
                ]
              : [],
        })
      );
    },
  });
};

const bigHands = (story: HandStory, pot: Chips): readonly Moment[] => {
  const best = new Map<SeatIndex, { rank: HandRank; tier: Tier }>();

  for (const [run, board] of story.boards.entries()) {
    for (const seat of winnersOf(story, run + 1)) {
      const found = shownHand(story, seat).pipe(
        Option.flatMap((hole) =>
          bigHandTier(hole, board).pipe(
            Option.map((tier) => ({ rank: rankWith(hole, board), tier }))
          )
        )
      );

      if (Option.isSome(found)) {
        const held = best.get(seat);

        if (held === undefined || found.value.rank > held.rank) {
          best.set(seat, found.value);
        }
      }
    }
  }

  return [...best].flatMap(([seat, { rank, tier }]) =>
    tier > 1 || pot >= BIG_POT_BLINDS * story.bigBlind
      ? [Moments.BigHand({ pot, rank, seats: [seat], tier })]
      : []
  );
};

const sevenDeuces = (story: HandStory, pot: Chips): readonly Moment[] => {
  const winners = new Set(story.results.flatMap((result) => result.winners));

  return [...winners].flatMap((seat) =>
    Option.match(shownHand(story, seat), {
      onNone: () => [],
      onSome: (hole) => {
        const ranks = hole.map((card) => rankOf(card)).toSorted(byNumber);

        return ranks[0] === DEUCE && ranks[1] === SEVEN
          ? [
              Moments.SevenDeuce({
                pot,
                seats: [seat],
                showdown: story.showdown,
                tier: 1,
              }),
            ]
          : [];
      },
    })
  );
};

interface Showdown {
  readonly contenders: readonly SeatIndex[];
  readonly holes: readonly (readonly Card[])[];
  readonly runs: readonly (readonly SeatIndex[])[];
}

const mainShowdown = (story: HandStory): Option.Option<Showdown> => {
  const results = mainResults(story);
  const contenders = results[0]?.eligible ?? [];
  let amount = 0;

  for (const result of results) {
    amount += result.amount;
  }

  const holes = contenders.flatMap((seat) =>
    Option.match(shownHand(story, seat), {
      onNone: () => [],
      onSome: (hole) => [hole],
    })
  );

  return story.showdown &&
    contenders.length >= 2 &&
    amount >= BIG_POT_BLINDS * story.bigBlind
    ? Option.some({
        contenders,
        holes,
        runs: story.boards.map((_, run) => mainWinners(story, run + 1)),
      })
    : Option.none();
};

const splitRuns = (
  story: HandStory,
  showdown: Showdown,
  pot: Chips
): readonly Moment[] => {
  const outcomes = new Set(
    showdown.runs.map((winners) => winners.toSorted(byNumber).join(" "))
  );

  return showdown.runs.length >= 2 && outcomes.size > 1
    ? [
        Moments.SplitRuns({
          pot,
          runs: showdown.runs.length,
          seats: [...new Set(showdown.runs.flat())],
          tier: 1,
        }),
      ]
    : [];
};

const sameHands = (
  story: HandStory,
  showdown: Showdown,
  pot: Chips
): readonly Moment[] => {
  const [winners = []] = showdown.runs;
  const board = story.boards[0] ?? story.common;

  const held = winners.flatMap((seat) =>
    Option.match(shownHand(story, seat), {
      onNone: () => [],
      onSome: (hole) => [
        {
          rank: rankWith(hole, board),
          ranks: hole
            .map((card) => rankOf(card))
            .toSorted(byNumber)
            .join(" "),
        },
      ],
    })
  );

  const [first] = held;

  return showdown.runs.length === 1 &&
    first !== undefined &&
    winners.length >= 2 &&
    winners.some((seat) => story.allIn.includes(seat)) &&
    held.length === winners.length &&
    held.every((each) => each.ranks === first.ranks)
    ? [Moments.SameHand({ pot, rank: first.rank, seats: winners, tier: 1 })]
    : [];
};

const finalRank = (story: HandStory, hole: readonly Card[]) =>
  HandRankSchema.make(
    Math.max(...story.boards.map((board) => rankWith(hole, board)))
  );

const ownsAtTheEnd = (story: HandStory, hole: readonly Card[]) =>
  story.boards.some((board) => ownsMore(hole, board));

const swings = (
  story: HandStory,
  showdown: Showdown,
  pot: Chips
): readonly Moment[] => {
  const [first = []] = showdown.runs;
  const [winner] = first;

  if (
    winner === undefined ||
    showdown.holes.length !== showdown.contenders.length ||
    showdown.runs.some(
      (winners) => winners.length !== 1 || winners[0] !== winner
    )
  ) {
    return [];
  }

  const moneyIn = moneyInBoard(story, showdown.contenders);
  const board = story.common.slice(0, moneyIn);
  const equity = equities(showdown.holes, board);
  const won = showdown.contenders.indexOf(winner);
  const street = streetOf(moneyIn);
  const winnerHole = showdown.holes[won] ?? [];
  const winningRank = finalRank(story, winnerHole);

  const odds = (index: number) => ({
    exact: equity.exact,
    percent: percentOf(equity, index),
  });

  const losers = showdown.contenders.flatMap((seat, index) =>
    index === won ? [] : [{ hole: showdown.holes[index] ?? [], index, seat }]
  );

  const beats = losers.flatMap(({ hole, index, seat }) => {
    const rank = finalRank(story, hole);

    const favoured =
      (equity.shares[index] ?? 0) > (equity.shares[won] ?? 0) &&
      ownsAtTheEnd(story, hole);

    const byOdds =
      moneyIn < FULL_BOARD ? favouriteTier(equity, index) : Option.none();

    const byHand =
      favoured && moneyIn < FULL_BOARD
        ? Option.fromUndefinedOr(LOSING_HAND_TIERS[handCategory(rank)])
        : Option.none<Tier>();

    const tier = Option.match(byOdds, {
      onNone: () => byHand,
      onSome: (held) =>
        Option.some(
          Option.match(byHand, {
            onNone: () => held,
            onSome: (found) => tierAtLeast(held, found),
          })
        ),
    });

    return Option.match(tier, {
      onNone: () => [],
      onSome: (found) => [
        Moments.BadBeat({
          odds: odds(index),
          pot,
          rank,
          seats: [seat, winner],
          street,
          tier: found,
          winningRank,
        }),
      ],
    });
  });

  const [favourite] = losers.toSorted(
    (left, right) =>
      (equity.shares[right.index] ?? 0) - (equity.shares[left.index] ?? 0)
  );

  const suckouts =
    moneyIn < FULL_BOARD && favourite !== undefined
      ? Option.match(longShotTier(equity, won), {
          onNone: () => [],
          onSome: (tier) => [
            Moments.Suckout({
              odds: odds(won),
              pot,
              seats: [winner, favourite.seat],
              street,
              tier,
            }),
          ],
        })
      : [];

  const coolers = losers.flatMap(({ hole, index, seat }) => {
    const rank = finalRank(story, hole);

    return (story.allIn.includes(seat) ||
      (story.committed[seat] ?? 0) >= COOLER_STAKE_BLINDS * story.bigBlind) &&
      collide(hole, winnerHole, board) &&
      (equity.shares[won] ?? 0) > (equity.shares[index] ?? 0)
      ? [
          Moments.Cooler({
            pot,
            rank,
            seats: [seat, winner],
            street,
            tier: COOLER_TIERS[handCategory(rank)] ?? 1,
            winningRank,
          }),
        ]
      : [];
  });

  return [...beats, ...suckouts, ...coolers];
};

const recognised = (story: HandStory): readonly Moment[] => {
  const pot = chipsOf(potTotal(story));

  const fromShowdown = Option.match(mainShowdown(story), {
    onNone: () => [],
    onSome: (showdown) => [
      ...swings(story, showdown, pot),
      ...sameHands(story, showdown, pot),
      ...splitRuns(story, showdown, pot),
    ],
  });

  return [
    ...bigHands(story, pot),
    ...fromShowdown,
    ...bluffs(story, pot),
    ...heroCalls(story, pot),
    ...sevenDeuces(story, pot),
  ];
};

const kindOrder = (moment: Moment) => MOMENT_KINDS.indexOf(moment._tag);

export const ranked = (moments: readonly Moment[]): readonly Moment[] =>
  moments.toSorted(
    (left, right) =>
      right.tier - left.tier || kindOrder(left) - kindOrder(right)
  );

export const momentsOf = (
  events: readonly SeenTableEvent[]
): readonly Moment[] =>
  Option.match(storyOf(events), {
    onNone: () => [],
    onSome: (story) => ranked(recognised(story)).slice(0, MOST_MOMENTS),
  });

export const isPainful = (moment: Moment) =>
  Moments.$is("BadBeat")(moment) || Moments.$is("Cooler")(moment);

const mirrors = (lead: Moment, other: Moment) => {
  const pair = new Set([lead._tag, other._tag]);

  return (
    pair.has("BadBeat") &&
    pair.has("Suckout") &&
    lead.seats[0] === other.seats[1] &&
    lead.seats[1] === other.seats[0]
  );
};

export interface Headline {
  readonly also: Option.Option<Moment>;
  readonly lead: Moment;
}

export const headline = (
  moments: readonly Moment[],
  callouts: MomentCallouts
): Option.Option<Headline> => {
  if (callouts === "Off") {
    return Option.none();
  }

  const allowed = moments.filter(
    (moment) => callouts === "All" || !isPainful(moment)
  );

  return Option.fromUndefinedOr(allowed[0]).pipe(
    Option.map((lead) => ({
      also: Option.fromUndefinedOr(
        allowed.slice(1).find((other) => !mirrors(lead, other))
      ),
      lead,
    }))
  );
};
