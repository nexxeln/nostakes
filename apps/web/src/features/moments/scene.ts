import type { Expression } from "@nostakes/avatar";
import {
  Events,
  SeatIndexSchema,
  bestHand,
  cardText,
  handCategory,
  rankHand,
  rankOf,
  variantOf,
} from "@nostakes/engine";
import type { Card, HandCategory, SeatIndex } from "@nostakes/engine";
import {
  Moments,
  ReplaySteps,
  headline,
  isPainful,
  momentsOf,
  replayOf,
} from "@nostakes/room";
import type {
  Headline,
  Moment,
  Replay,
  ReplayStep,
  SeenTableEvent,
} from "@nostakes/room";
import { Option } from "effect";
import type { Types } from "effect";

import { isolated } from "../names.js";
import { boardLine, chipsText } from "./captions.js";
import type { MomentHand, Person } from "./element.js";
import {
  capitalised,
  handName,
  holdingName,
  playingHole,
  ranksWord,
  startingHandName,
} from "./hand-names.js";
import type { MomentPicture, PictureFlag, PictureSeat } from "./schema.js";
import { handEnded } from "./watch.js";

export type LastHand = MomentHand["lastHand"];

type People = readonly Person[];

const STRANGER = { avatar: "", name: "Someone" };

const FLOP_CARDS = 3;

const personAt = (people: People, lastHand: LastHand, seat: SeatIndex) => {
  const player = lastHand.dealtIn.find((dealt) => dealt.seat === seat)?.player;

  return people.find((person) => person.player === player) ?? STRANGER;
};

const shownAt = (lastHand: LastHand, seat: SeatIndex): readonly Card[] =>
  lastHand.shown.find((shown) => shown.seat === seat)?.cards ?? [];

const wholeHand = (lastHand: LastHand, hole: readonly Card[]) =>
  hole.length === variantOf(lastHand.game).holeCards;

const namedBoard = (moment: Moment): Option.Option<number> =>
  "board" in moment ? Option.fromUndefinedOr(moment.board) : Option.none();

const boardNumberOf = (moment: Moment) =>
  Option.getOrElse(namedBoard(moment), () => 1);

const boardOf = (lastHand: LastHand, moment: Moment): readonly Card[] =>
  lastHand.boards[boardNumberOf(moment) - 1] ?? [];

export const winnerSeat = (moment: Moment): Option.Option<SeatIndex> =>
  Moments.$match(moment, {
    BadBeat: ({ seats }) => Option.fromUndefinedOr(seats[1]),
    BigHand: ({ seats }) => Option.fromUndefinedOr(seats[0]),
    Bluff: ({ seats }) => Option.fromUndefinedOr(seats[0]),
    Cooler: ({ seats }) => Option.fromUndefinedOr(seats[1]),
    HeroCall: ({ seats }) => Option.fromUndefinedOr(seats[0]),
    SameHand: ({ seats }) => Option.fromUndefinedOr(seats[0]),
    Scoop: ({ seats }) => Option.fromUndefinedOr(seats[0]),
    SevenDeuce: ({ seats }) => Option.fromUndefinedOr(seats[0]),
    SplitRuns: ({ seats }) => Option.fromUndefinedOr(seats[0]),
    Suckout: ({ seats }) => Option.fromUndefinedOr(seats[0]),
  });

const bothWin = (moment: Moment) =>
  Moments.$is("SameHand")(moment) || Moments.$is("SplitRuns")(moment);

export const replayFor = (
  record: readonly SeenTableEvent[]
): Option.Option<Replay> => replayOf(record, () => []);

type Paid = readonly (readonly [SeatIndex, number])[];

const paid = (seat: SeatIndex, amount: number): Paid => [[seat, amount]];

const stepSeat = (step: ReplayStep): Paid =>
  ReplaySteps.$match(step, {
    Acted: ({ added, seat }) => paid(seat, -added),
    Awarded: ({ shares }) =>
      shares.flatMap((share) => paid(share.seat, share.amount)),
    Bounty: ({ payers, seat }) => [
      ...paid(
        seat,
        payers.reduce((total, payer) => total + payer.amount, 0)
      ),
      ...payers.flatMap((payer) => paid(payer.seat, -payer.amount)),
    ],
    Dealt: () => [],
    Gathered: () => [],
    Mucked: () => [],
    Odds: () => [],
    Posted: ({ amount, seat }) => paid(seat, -amount),
    Returned: ({ amount, seat }) => paid(seat, amount),
    Runs: () => [],
    Shown: () => [],
    StreetDealt: () => [],
  });

export const swingsOf = (replay: Replay): ReadonlyMap<SeatIndex, number> => {
  const swings = new Map<SeatIndex, number>();

  for (const step of replay.steps) {
    for (const [seat, amount] of stepSeat(step)) {
      swings.set(seat, (swings.get(seat) ?? 0) + amount);
    }
  }

  return swings;
};

const lastFolder = (replay: Replay, besides: SeatIndex) =>
  Option.fromUndefinedOr(
    replay.steps.findLast(
      (step) =>
        ReplaySteps.$is("Acted")(step) &&
        step.act === "Fold" &&
        step.seat !== besides
    )
  ).pipe(
    Option.flatMap((step) =>
      ReplaySteps.$is("Acted")(step) ? Option.some(step.seat) : Option.none()
    )
  );

const foilOf = (
  moment: Moment,
  lastHand: LastHand,
  replay: Option.Option<Replay>,
  lead: SeatIndex
): Option.Option<SeatIndex> => {
  if (Moments.$is("Bluff")(moment)) {
    return replay.pipe(Option.flatMap((told) => lastFolder(told, lead)));
  }

  const stayed = lastHand.dealtIn.filter(
    (dealt) => !dealt.folded && dealt.seat !== lead
  );

  const swings = Option.match(replay, {
    onNone: () => new Map<SeatIndex, number>(),
    onSome: swingsOf,
  });

  const [biggestLoser] = stayed
    .map((dealt) => dealt.seat)
    .toSorted(
      (left, right) => (swings.get(left) ?? 0) - (swings.get(right) ?? 0)
    );

  return Option.fromUndefinedOr(biggestLoser);
};

export interface Principals {
  readonly lead: SeatIndex;
  readonly other: Option.Option<SeatIndex>;
}

export const principalsOf = (
  moment: Moment,
  lastHand: LastHand,
  replay: Option.Option<Replay>
): Option.Option<Principals> => {
  const distinct = [...new Set(moment.seats)];

  return Option.fromUndefinedOr(
    Option.getOrUndefined(winnerSeat(moment)) ?? distinct[0]
  ).pipe(
    Option.map((lead) => {
      const named = distinct.find((seat) => seat !== lead);

      return {
        lead,
        other:
          named === undefined
            ? foilOf(moment, lastHand, replay, lead)
            : Option.some(named),
      };
    })
  );
};

const CATEGORY_WORDS: Readonly<Record<HandCategory, string>> = {
  Flush: "flush",
  FourOfAKind: "quads",
  FullHouse: "full house",
  HighCard: "high card",
  OnePair: "pair",
  RoyalFlush: "royal flush",
  Straight: "straight",
  StraightFlush: "straight flush",
  ThreeOfAKind: "three of a kind",
  TwoPair: "two pair",
};

const KICKERS: Readonly<Record<Moment["_tag"], string>> = {
  BadBeat: "Bad beat",
  BigHand: "Big hand",
  Bluff: "Bluff",
  Cooler: "Cooler",
  HeroCall: "Hero call",
  SameHand: "Same hand",
  Scoop: "Scoop",
  SevenDeuce: "Seven-deuce",
  SplitRuns: "Ran it twice",
  Suckout: "Suckout",
};

const RUN_WORDS = ["", "once", "twice", "three times"];

const STREET_WORDS = ["Flop", "Flop", "Flop", "Turn", "River"];

const streetWordAt = (index: number) =>
  STREET_WORDS[index] ?? STREET_WORDS.at(-1) ?? "River";

const GAME_WORDS = { Holdem: "hold'em", Omaha: "Omaha" } as const;

export const wholeUnits = (amount: number, unit: number) => {
  if (unit <= 0 || amount < unit) {
    return 0;
  }

  let low = 0;
  let high = 1;

  while (high * unit <= amount) {
    low = high;
    high *= 2;
  }

  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);

    if (middle * unit <= amount) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return low;
};

interface Seen {
  readonly board: readonly Card[];
  readonly hole: readonly Card[];
  readonly person: { readonly avatar: string; readonly name: string };
  readonly seat: SeatIndex;
  readonly swing: Option.Option<number>;
  readonly whole: boolean;
}

const seenAt = (
  people: People,
  lastHand: LastHand,
  board: readonly Card[],
  swings: Option.Option<ReadonlyMap<SeatIndex, number>>,
  seat: SeatIndex
): Seen => {
  const hole = shownAt(lastHand, seat);

  return {
    board,
    hole,
    person: personAt(people, lastHand, seat),
    seat,
    swing: swings.pipe(Option.map((found) => found.get(seat) ?? 0)),
    whole: wholeHand(lastHand, hole),
  };
};

const rankOfSeen = (lastHand: LastHand, seen: Seen) =>
  seen.whole && seen.board.length >= FLOP_CARDS
    ? Option.some(rankHand(lastHand.game, seen.hole, seen.board))
    : Option.none();

const handOf = (lastHand: LastHand, seen: Seen) =>
  Option.match(rankOfSeen(lastHand, seen), {
    onNone: () =>
      seen.whole ? capitalised(holdingName(lastHand.game, seen.hole)) : "",
    onSome: (rank) => capitalised(handName(rank)),
  });

const categoryWord = (lastHand: LastHand, seen: Seen) =>
  Option.match(rankOfSeen(lastHand, seen), {
    onNone: () => "hand",
    onSome: (rank) => CATEGORY_WORDS[handCategory(rank)],
  });

const named = (seen: Seen) => isolated(seen.person.name);

const lossOf = (seen: Seen) =>
  seen.swing.pipe(
    Option.filter((swing) => swing < 0),
    Option.map((swing) => chipsText(-swing))
  );

const lower = (text: string) =>
  `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

const playingOf = (lastHand: LastHand, seen: Seen): readonly Card[] =>
  seen.whole && seen.board.length >= FLOP_CARDS
    ? bestHand(lastHand.game, seen.hole, seen.board)
    : [];

interface Telling {
  readonly flag: Option.Option<PictureFlag>;
  readonly lastHand: LastHand;
  readonly lead: Seen;
  readonly moment: Moment;
  readonly other: Option.Option<Seen>;
}

interface Words {
  readonly foot?: string;
  readonly leadNote: string;
  readonly line: string;
  readonly otherHand?: string;
  readonly otherNote: string;
  readonly title: string;
  readonly verb: string;
}

const flagStreet = (telling: Telling) =>
  Option.match(telling.flag, {
    onNone: () => "river",
    onSome: (flag) => lower(flag.word),
  });

const pocketPair = (lastHand: LastHand, seen: Seen) => {
  const ranks = new Set(seen.hole.map((card) => rankOf(card)));

  return seen.whole &&
    ranks.size === 1 &&
    variantOf(lastHand.game).holeCards === 2
    ? Option.fromUndefinedOr([...ranks][0])
    : Option.none<number>();
};

const versus = (telling: Telling, write: (other: Seen) => Words): Words =>
  Option.match(telling.other, {
    onNone: () => ({
      leadNote: "",
      line: "",
      otherNote: "",
      title: handOf(telling.lastHand, telling.lead),
      verb: "",
    }),
    onSome: write,
  });

const wordsFor = (telling: Telling): Words => {
  const { lastHand, lead, moment } = telling;
  const who = named(lead);
  const hand = handOf(lastHand, lead);

  return Moments.$match(moment, {
    BadBeat: ({ odds }) =>
      versus(telling, (other) => ({
        leadNote: `got there on the ${flagStreet(telling)}`,
        line: `${named(other)} was ${odds.percent}% to win when the chips went in. Then the ${flagStreet(telling)} came.`,
        otherNote: `was ${odds.percent}% to win`,
        title: Option.match(pocketPair(lastHand, other), {
          onNone: () => `${odds.percent}% and still lost`,
          onSome: (rank) => `${capitalised(ranksWord(rank))} cracked`,
        }),
        verb: `${flagStreet(telling)}s`,
      })),
    BigHand: () =>
      Option.match(telling.other, {
        onNone: () => ({
          leadNote: "everyone folded",
          line: `${who} showed ${lower(hand)}. Everyone else had folded.`,
          otherNote: "",
          title: hand,
          verb: "",
        }),
        onSome: (other) => ({
          leadNote: "the best hand of the night so far",
          line: Option.match(lossOf(other), {
            onNone: () => `${named(other)} ran into ${lower(hand)}.`,
            onSome: (loss) => `${named(other)} paid ${loss} to see it.`,
          }),
          otherNote: "paid to see it",
          title: hand,
          verb: "beats",
        }),
      }),
    Bluff: ({ bet, street }) => ({
      foot: "Shown after the fold",
      leadNote: `bet ${chipsText(bet)} with nothing`,
      line: Option.match(telling.other, {
        onNone: () =>
          `${who} bet ${chipsText(bet)} on the ${lower(street)} with nothing, and showed it.`,
        onSome: (other) =>
          `${who} bet ${chipsText(bet)} on the ${lower(street)} with nothing. ${named(other)} folded, then ${who} showed.`,
      }),
      otherHand: "Folded",
      otherNote: "never shown",
      title: `${hand.length > 0 ? hand : "Nothing"}. Nobody called.`,
      verb: "bluffs",
    }),
    Cooler: () =>
      versus(telling, (other) => {
        const theirs = categoryWord(lastHand, other);
        const ours = categoryWord(lastHand, lead);

        return {
          leadNote:
            theirs === ours
              ? `the better ${ours}`
              : `beat ${theirs === "quads" ? "" : "a "}${theirs}`,
          line: Option.match(lossOf(other), {
            onNone: () =>
              `${named(other)}'s ${lower(handOf(lastHand, other))} ran into ${lower(hand)}.`,
            onSome: (loss) =>
              theirs === ours
                ? `${named(other)} paid ${loss} to see the second-best ${theirs}.`
                : `${named(other)} paid ${loss} to lose with ${lower(handOf(lastHand, other))}.`,
          }),
          otherNote: theirs === ours ? `second-best ${theirs}` : "second best",
          title: `${capitalised(ours)} over ${theirs}`,
          verb: "beats",
        };
      }),
    HeroCall: ({ call, street }) =>
      versus(telling, (other) => ({
        leadNote: `called ${chipsText(call)}`,
        line: other.whole
          ? `${who} called ${chipsText(call)} on the ${lower(street)}. ${named(other)} had ${lower(handOf(lastHand, other))}.`
          : `${who} called ${chipsText(call)} on the ${lower(street)}, and was right.`,
        otherNote: "caught",
        title: `Called with ${lower(hand)}`,
        verb: "calls down",
      })),
    SameHand: ({ pot }) =>
      versus(telling, (other) => ({
        leadNote: "split the pot",
        line: `Same hand, same pot. ${who} and ${named(other)} split ${chipsText(pot)}.`,
        otherNote: "split the pot",
        title: lead.whole
          ? `Both had ${startingHandName(playingHole(lastHand.game, lead.hole, lead.board))}`
          : "Same hand",
        verb: "chops with",
      })),
    Scoop: ({ pot }) =>
      versus(telling, (other) => ({
        leadNote: "won both boards",
        line: `${who} took both boards and all ${chipsText(pot)}.`,
        otherNote: Option.match(lossOf(other), {
          onNone: () => "lost both",
          onSome: (loss) => `lost ${loss} on two boards`,
        }),
        title: "Both boards",
        verb: "scoops",
      })),
    SevenDeuce: ({ bounty }) => ({
      leadNote:
        bounty > 0 ? `collected a ${chipsText(bounty)} bounty` : "seven-deuce",
      line:
        bounty > 0
          ? `The worst hand in poker won, and the table paid ${who} ${chipsText(bounty)}.`
          : `${who} won with the worst hand in poker.`,
      otherNote: "lost to seven-deuce",
      title: "Seven-deuce wins",
      verb: "beats",
    }),
    SplitRuns: ({ runs }) =>
      versus(telling, (other) => ({
        leadNote: "won a run",
        line: `Ran it ${RUN_WORDS[runs] ?? `${runs} times`}, split it with ${named(other)}.`,
        otherNote: "won a run",
        title: "One each",
        verb: "splits with",
      })),
    Suckout: ({ odds }) =>
      versus(telling, (other) => ({
        leadNote: `had ${odds.percent}% to win`,
        line: Option.match(lossOf(other), {
          onNone: () => `${who} had ${odds.percent}% and found it.`,
          onSome: (loss) =>
            `${who} had ${odds.percent}% and found it. ${named(other)} paid ${loss}.`,
        }),
        otherNote: "was ahead",
        title: `${hand} on the ${flagStreet(telling)}`,
        verb: `${flagStreet(telling)}s`,
      })),
  });
};

const flagOf = (
  lastHand: LastHand,
  moment: Moment,
  lead: Seen
): Option.Option<PictureFlag> => {
  const board = boardOf(lastHand, moment);
  const playing = new Set(playingOf(lastHand, lead));

  const index = board.findLastIndex((card) => playing.has(card));

  return Option.fromUndefinedOr(board[index]).pipe(
    Option.map((card) => ({
      board: boardNumberOf(moment),
      card: cardText(card),
      word: streetWordAt(index),
    }))
  );
};

const metaOf = (lastHand: LastHand, replay: Option.Option<Replay>) => {
  const game = GAME_WORDS[lastHand.game];
  const boards = lastHand.doubleBoard ? " · double board" : "";

  const stakes = Option.match(replay, {
    onNone: () => "",
    onSome: (told) => {
      if (told.bombAnte !== null) {
        return "bomb pot · ";
      }

      const small = told.steps.find(
        (step) => ReplaySteps.$is("Posted")(step) && step.post === "Small"
      );

      return small !== undefined && ReplaySteps.$is("Posted")(small)
        ? `${chipsText(small.amount)}/${chipsText(told.bigBlind)} `
        : `${chipsText(told.bigBlind)} big blind `;
    },
  });

  return `Hand ${lastHand.handNumber} · ${stakes}${game}${boards}`;
};

const moodOf = (won: boolean, quiet: boolean): Expression => {
  if (won) {
    return "Happy";
  }

  return quiet ? "Resting" : "Gutted";
};

const shownHandOf = (lastHand: LastHand, seen: Seen) => {
  if (seen.hole.length > 0) {
    return handOf(lastHand, seen);
  }

  return lastHand.dealtIn.find((dealt) => dealt.seat === seen.seat)?.folded ===
    true
    ? "Folded"
    : "Didn't show";
};

const seatOf = (
  lastHand: LastHand,
  seen: Seen,
  facts: {
    readonly hand: string;
    readonly note: string;
    readonly playing: readonly Card[];
    readonly won: boolean;
  }
): PictureSeat => {
  const quiet = !facts.won && seen.hole.length === 0;

  return {
    avatar: seen.person.avatar,
    backs: Math.max(0, variantOf(lastHand.game).holeCards - seen.hole.length),
    cards: seen.hole.map(cardText),
    expression: moodOf(facts.won, quiet),
    hand: facts.hand,
    name: seen.person.name,
    note: facts.note,
    playing: facts.playing
      .filter((card) => seen.hole.includes(card))
      .map(cardText),
    swing: Option.getOrNull(seen.swing),
    won: facts.won,
  };
};

const wonBy = (moment: Moment, seen: Seen, lead: SeatIndex) =>
  Option.match(seen.swing, {
    onNone: () => seen.seat === lead || bothWin(moment),
    onSome: (swing) => swing > 0 || (bothWin(moment) && swing >= 0),
  });

export const pictureOf = (
  people: People,
  lastHand: LastHand,
  { also, lead }: Headline,
  record: readonly SeenTableEvent[] = []
): MomentPicture => {
  const replay = replayFor(record);
  const swings = replay.pipe(Option.map(swingsOf));
  const board = boardOf(lastHand, lead);

  const principals: Principals = Option.getOrElse(
    principalsOf(lead, lastHand, replay),
    () => ({
      lead:
        lastHand.dealtIn[0]?.seat ??
        lastHand.shown[0]?.seat ??
        SeatIndexSchema.make(0),
      other: Option.none<SeatIndex>(),
    })
  );

  const leader = seenAt(people, lastHand, board, swings, principals.lead);

  const other = principals.other.pipe(
    Option.map((seat) => seenAt(people, lastHand, board, swings, seat))
  );

  const flag = flagOf(lastHand, lead, leader);
  const telling = { flag, lastHand, lead: leader, moment: lead, other };
  const words = wordsFor(telling);
  const playing = playingOf(lastHand, leader);

  const bigBlind = Option.match(replay, {
    onNone: () => 0,
    onSome: (told) => told.bigBlind,
  });

  const line = Option.match(namedBoard(lead), {
    onNone: () => words.line,
    onSome: (number) => boardLine(number, words.line),
  });

  const otherSeat = other.pipe(
    Option.map((seen) =>
      seatOf(lastHand, seen, {
        hand: words.otherHand ?? shownHandOf(lastHand, seen),
        note: words.otherNote,
        playing: playingOf(lastHand, seen),
        won: wonBy(lead, seen, principals.lead),
      })
    )
  );

  return {
    blinds: wholeUnits(lead.pot, bigBlind),
    boards: lastHand.boards.map((each) => each.map(cardText)),
    flag: Option.getOrNull(flag),
    foot:
      words.foot ??
      Option.match(also, {
        onNone: () => "",
        onSome: (second) => `Also: ${lower(KICKERS[second._tag])}`,
      }),
    hand: lastHand.handNumber,
    kicker: KICKERS[lead._tag].toUpperCase(),
    kind: lead._tag,
    lifted: playing.filter((card) => board.includes(card)).map(cardText),
    line,
    meta: metaOf(lastHand, replay),
    painful: isPainful(lead),
    pot: lead.pot,
    seats: [
      seatOf(lastHand, leader, {
        hand: handOf(lastHand, leader),
        note: words.leadNote,
        playing,
        won: wonBy(lead, leader, principals.lead),
      }),
      ...Option.toArray(otherSeat),
    ],
    tier: lead.tier,
    title: words.title,
    verb: Option.isSome(otherSeat) ? words.verb.toUpperCase() : "",
  };
};

export interface ShownMoment {
  readonly id: string;
  readonly lead: Moment;
  readonly picture: MomentPicture;
  readonly seats: readonly SeatIndex[];
}

export const headlineOf = (hand: MomentHand): Option.Option<Headline> => {
  const [first] = hand.record;

  if (
    first === undefined ||
    !Events.$is("HandStarted")(first) ||
    first.handNumber !== hand.lastHand.handNumber ||
    !handEnded(hand.record)
  ) {
    return Option.none();
  }

  return headline(momentsOf(hand.record), hand.callouts);
};

export const momentIdOf = (hand: MomentHand, lead: Moment) =>
  [hand.lastHand.handNumber, lead._tag, lead.tier, lead.seats.join(",")].join(
    ":"
  );

export const shownMomentOf = (hand: MomentHand): Option.Option<ShownMoment> =>
  headlineOf(hand).pipe(
    Option.map((found) => ({
      id: momentIdOf(hand, found.lead),
      lead: found.lead,
      picture: pictureOf(hand.people, hand.lastHand, found, hand.record),
      seats: found.lead.seats,
    }))
  );

export type Answer = "Call" | "Fold" | "None";

export interface DealtCard {
  readonly board: number;
  readonly card: string;
}

export interface MomentStory {
  readonly answer: Answer;
  readonly bet: string;
  readonly betTab: string;
  readonly dealt: readonly DealtCard[];
  readonly first: number;
  readonly hiddenFirst: boolean;
  readonly hit: string;
  readonly hook: string;
  readonly hookCards: number;
  readonly pause: string;
  readonly pots: { readonly bet: number; readonly hook: number };
}

const AGGRESSIVE = new Set(["Bet", "Raise"]);

const STREET_NAMES = ["", "", "", "flop", "turn", "river"];

const handAt = (lastHand: LastHand, seen: Seen, board: readonly Card[]) =>
  lower(handOf(lastHand, { ...seen, board }));

const dealOrderOf = (
  replay: Replay
): readonly (DealtCard & { readonly at: number })[] =>
  replay.steps.flatMap((step) =>
    ReplaySteps.$is("StreetDealt")(step)
      ? step.cards.map((card) => ({
          at: step.at,
          board: step.run,
          card: cardText(card),
        }))
      : []
  );

const paidIn = (step: ReplayStep) =>
  ReplaySteps.$match(step, {
    Acted: ({ added }) => added,
    Awarded: () => 0,
    Bounty: () => 0,
    Dealt: () => 0,
    Gathered: () => 0,
    Mucked: () => 0,
    Odds: () => 0,
    Posted: ({ amount }) => amount,
    Returned: ({ amount }) => -amount,
    Runs: () => 0,
    Shown: () => 0,
    StreetDealt: () => 0,
  });

const paidBefore = (replay: Replay, before: number) => {
  let total = 0;

  for (const step of replay.steps) {
    if (step.at < before) {
      total += paidIn(step);
    }
  }

  return total;
};

type Acted = Types.ExtractTag<ReplayStep, "Acted">;

const actedOf = (step: ReplayStep | undefined): Acted | null =>
  step !== undefined && ReplaySteps.$is("Acted")(step) ? step : null;

const answerOf = (step: Acted | null): Answer => {
  if (step?.act === "Fold") {
    return "Fold";
  }

  return step?.act === "Call" ? "Call" : "None";
};

const betTabOf = (acted: Acted) => {
  if (acted.allIn) {
    return `ALL IN ${chipsText(acted.to)}`;
  }

  return `${acted.act === "Raise" ? "RAISES TO" : "BETS"} ${chipsText(acted.to)}`;
};

const betLineOf = (acted: Acted | null, leadName: string) => {
  if (acted === null) {
    return `${leadName} checks it down.`;
  }

  if (acted.allIn) {
    return `${leadName} shoves. All in for ${chipsText(acted.to)}.`;
  }

  return `${leadName} ${acted.act === "Raise" ? "raises to" : "bets"} ${chipsText(acted.to)}.`;
};

interface Cast {
  readonly hidden: boolean;
  readonly lastHand: LastHand;
  readonly leader: Seen | null;
  readonly other: Seen | null;
  readonly runOut: boolean;
  readonly visible: readonly Card[];
}

const nameOrSomeone = (seen: Seen | null) =>
  seen === null ? "Someone" : named(seen);

const hookOf = ({ hidden, lastHand, leader, visible }: Cast) => {
  if (leader !== null && !hidden && leader.whole) {
    return `${named(leader)} has ${handAt(lastHand, leader, visible)}.`;
  }

  return visible.length >= FLOP_CARDS
    ? `The ${STREET_NAMES[visible.length] ?? "board"}. ${nameOrSomeone(leader)} to act.`
    : `${nameOrSomeone(leader)} looks down at the cards.`;
};

const pauseOf = (cast: Cast, answer: Answer, toCall: number) => {
  if (cast.other === null) {
    return "Everyone else is out.";
  }

  return answer === "None"
    ? `${named(cast.other)} thinks.`
    : `${chipsText(toCall)} to call. ${named(cast.other)} thinks.`;
};

const calledOf = ({ lastHand, other, runOut, visible }: Cast) => {
  if (other === null || !other.whole) {
    return "Call.";
  }

  return runOut
    ? `Call. ${named(other)} has ${handAt(lastHand, other, visible)}. Run it.`
    : `Call. ${named(other)} has ${handAt(lastHand, other, other.board)}.`;
};

const hitOf = (cast: Cast, answer: Answer) => {
  const leadName = nameOrSomeone(cast.leader);

  if (answer === "Fold") {
    return `${cast.other === null ? "Everyone" : named(cast.other)} folds. ${leadName} shows.`;
  }

  if (answer === "Call") {
    return calledOf(cast);
  }

  return cast.other === null ? `${leadName} shows.` : "Cards up.";
};

const potsOf = (told: Replay | null, acted: Acted | null, pot: number) =>
  told === null || acted === null
    ? { bet: pot, hook: pot }
    : { bet: paidBefore(told, acted.at + 1), hook: paidBefore(told, acted.at) };

export const storyOf = (
  people: People,
  lastHand: LastHand,
  found: Headline,
  record: readonly SeenTableEvent[]
): MomentStory => {
  const replay = replayFor(record);
  const told = Option.getOrNull(replay);
  const board = boardOf(lastHand, found.lead);

  const principals = Option.getOrNull(
    principalsOf(found.lead, lastHand, replay)
  );

  const seats =
    principals === null
      ? []
      : [principals.lead, ...Option.toArray(principals.other)];

  const steps = told === null ? [] : told.steps;

  const acted = actedOf(
    steps.findLast(
      (step) =>
        ReplaySteps.$is("Acted")(step) &&
        seats.includes(step.seat) &&
        AGGRESSIVE.has(step.act)
    )
  );

  const solo = seats.length < 2;
  const firstSeat = acted?.seat ?? principals?.lead;

  const first =
    solo || firstSeat === undefined ? 0 : Math.max(0, seats.indexOf(firstSeat));

  const otherSeat = seats[1 - first];

  const answerStep =
    acted === null || otherSeat === undefined
      ? null
      : actedOf(
          steps.find(
            (step) =>
              step.at > acted.at &&
              ReplaySteps.$is("Acted")(step) &&
              step.seat === otherSeat
          )
        );

  const answer = answerOf(answerStep);
  const order = told === null ? [] : dealOrderOf(told);

  const hookCards =
    acted === null
      ? order.length
      : order.filter((dealt) => dealt.at < acted.at).length;

  const swings = replay.pipe(Option.map(swingsOf));

  const seenOf = (seat: SeatIndex | undefined) =>
    seat === undefined ? null : seenAt(people, lastHand, board, swings, seat);

  const cast: Cast = {
    hidden: solo || Moments.$is("Bluff")(found.lead),
    lastHand,
    leader: seenOf(seats[first]),
    other: seenOf(otherSeat),
    runOut: hookCards < order.length,
    visible: board.filter((card) =>
      order.slice(0, hookCards).some((dealt) => dealt.card === cardText(card))
    ),
  };

  const toCall =
    answerStep?.act === "Call" ? answerStep.added : (acted?.to ?? 0);

  return {
    answer,
    bet: betLineOf(acted, nameOrSomeone(cast.leader)),
    betTab: acted === null ? "" : betTabOf(acted),
    dealt: order.map(({ board: on, card }) => ({ board: on, card })),
    first,
    hiddenFirst: cast.hidden,
    hit: hitOf(cast, answer),
    hook: hookOf(cast),
    hookCards,
    pause: pauseOf(cast, answer, toCall),
    pots: potsOf(told, acted, found.lead.pot),
  };
};

export interface MomentScene {
  readonly picture: MomentPicture;
  readonly seats: readonly SeatIndex[];
  readonly story: MomentStory;
}

export const sceneFor = (
  people: People,
  lastHand: LastHand,
  found: Headline,
  record: readonly SeenTableEvent[]
): MomentScene => ({
  picture: pictureOf(people, lastHand, found, record),
  seats: Option.match(principalsOf(found.lead, lastHand, replayFor(record)), {
    onNone: () => found.lead.seats,
    onSome: ({ lead, other }) => [lead, ...Option.toArray(other)],
  }),
  story: storyOf(people, lastHand, found, record),
});

export const sceneOf = (hand: MomentHand): Option.Option<MomentScene> =>
  headlineOf(hand).pipe(
    Option.map((found) =>
      sceneFor(hand.people, hand.lastHand, found, hand.record)
    )
  );
