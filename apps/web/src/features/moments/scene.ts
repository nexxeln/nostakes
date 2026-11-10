import type { Expression } from "@nostakes/avatar";
import { Events, cardText, evaluate, handCategory } from "@nostakes/engine";
import type { Card, HandRank, SeatIndex } from "@nostakes/engine";
import { Moments, headline, isPainful, momentsOf } from "@nostakes/room";
import type { Headline, Moment } from "@nostakes/room";
import { Option } from "effect";

import { CAPTIONS } from "./captions.js";
import type { Caption, CaptionFacts } from "./captions.js";
import type { MomentHand, Person } from "./element.js";
import { bestFive, handName, startingHandName } from "./hand-names.js";
import type { MomentPicture, PictureFace } from "./picture.js";
import { handEnded } from "./watch.js";

type LastHand = MomentHand["lastHand"];

type People = readonly Person[];

const STRANGER = { avatar: "", name: "Someone" };

const personAt = (people: People, lastHand: LastHand, seat: SeatIndex) => {
  const player = lastHand.dealtIn.find((dealt) => dealt.seat === seat)?.player;

  return people.find((person) => person.player === player) ?? STRANGER;
};

const shownAt = (lastHand: LastHand, seat: SeatIndex): readonly Card[] =>
  lastHand.shown.find((shown) => shown.seat === seat)?.cards ?? [];

const leadOf = (moment: Moment) => moment.seats[0];

const otherOf = (moment: Moment) => moment.seats[1];

const EXPRESSIONS: Readonly<Record<Moment["_tag"], readonly Expression[]>> = {
  BadBeat: ["Gutted", "Happy"],
  BigHand: ["Happy"],
  Bluff: ["Happy"],
  Cooler: ["Gutted", "Happy"],
  HeroCall: ["Happy", "Gutted"],
  SameHand: ["Happy", "Happy"],
  SevenDeuce: ["Happy"],
  SplitRuns: ["Happy", "Happy"],
  Suckout: ["Happy", "Gutted"],
};

const winnerSeat = (moment: Moment): Option.Option<SeatIndex> =>
  Moments.$match(moment, {
    BadBeat: ({ seats }) => Option.fromUndefinedOr(seats[1]),
    BigHand: ({ seats }) => Option.fromUndefinedOr(seats[0]),
    Bluff: () => Option.none(),
    Cooler: ({ seats }) => Option.fromUndefinedOr(seats[1]),
    HeroCall: () => Option.none(),
    SameHand: () => Option.none(),
    SevenDeuce: ({ seats }) => Option.fromUndefinedOr(seats[0]),
    SplitRuns: () => Option.none(),
    Suckout: ({ seats }) => Option.fromUndefinedOr(seats[0]),
  });

const liftedOf = (moment: Moment, lastHand: LastHand) => {
  const [board = []] = lastHand.boards;

  const holeOnly =
    Moments.$is("Bluff")(moment) || Moments.$is("HeroCall")(moment);

  const lead = leadOf(moment);

  if (holeOnly && lead !== undefined) {
    return shownAt(lastHand, lead);
  }

  return Option.match(winnerSeat(moment), {
    onNone: () => [],
    onSome: (seat) => {
      const hole = shownAt(lastHand, seat);

      return hole.length === 2 && board.length >= 3
        ? bestFive(hole, board)
        : [];
    },
  });
};

const rankOn = (lastHand: LastHand, seat: SeatIndex | undefined) => {
  const [board = []] = lastHand.boards;
  const hole = seat === undefined ? [] : shownAt(lastHand, seat);

  return hole.length === 2 && board.length >= 3
    ? Option.some(evaluate([...hole, ...board]))
    : Option.none<HandRank>();
};

const factsFor = (
  people: People,
  lastHand: LastHand,
  moment: Moment
): CaptionFacts => {
  const lead = leadOf(moment);
  const other = otherOf(moment);

  const named = (seat: SeatIndex | undefined) =>
    seat === undefined ? STRANGER.name : personAt(people, lastHand, seat).name;

  const leadRank =
    "rank" in moment ? Option.some(moment.rank) : rankOn(lastHand, lead);

  const otherRank =
    "winningRank" in moment
      ? Option.some(moment.winningRank)
      : rankOn(lastHand, other);

  const preflop = "street" in moment && moment.street === "Preflop";
  const leadHole = lead === undefined ? [] : shownAt(lastHand, lead);
  const otherHole = other === undefined ? [] : shownAt(lastHand, other);

  const handOf = (rank: Option.Option<HandRank>, hole: readonly Card[]) =>
    preflop && hole.length === 2
      ? startingHandName(hole)
      : Option.match(rank, { onNone: () => "", onSome: handName });

  return {
    against: named(other),
    bet: Moments.$match(moment, {
      BadBeat: () => 0,
      BigHand: () => 0,
      Bluff: ({ bet }) => bet,
      Cooler: () => 0,
      HeroCall: ({ call }) => call,
      SameHand: () => 0,
      SevenDeuce: () => 0,
      SplitRuns: () => 0,
      Suckout: () => 0,
    }),
    category: Option.match(leadRank, {
      onNone: () => "HighCard",
      onSome: handCategory,
    }),
    hand: handOf(leadRank, leadHole),
    other: handOf(otherRank, otherHole),
    percent: "odds" in moment ? moment.odds.percent : 0,
    runs: Moments.$is("SplitRuns")(moment) ? moment.runs : 1,
    start: leadHole.length === 2 ? startingHandName(leadHole) : "",
    who: named(lead),
  };
};

export const captionOf = (
  people: People,
  lastHand: LastHand,
  moment: Moment
): Caption => {
  const write = CAPTIONS[moment._tag][moment.tier];
  const facts = factsFor(people, lastHand, moment);

  return write === undefined ? { line: "", title: facts.who } : write(facts);
};

const facesOf = (
  people: People,
  lastHand: LastHand,
  moment: Moment
): readonly PictureFace[] => {
  const expressions = EXPRESSIONS[moment._tag];

  return moment.seats.slice(0, 2).map((seat, index) => {
    const person = personAt(people, lastHand, seat);

    return {
      avatar: person.avatar,
      cards: shownAt(lastHand, seat).map(cardText),
      expression: expressions[index] ?? "Happy",
      name: person.name,
    };
  });
};

export const pictureOf = (
  people: People,
  lastHand: LastHand,
  { also, lead }: Headline
): MomentPicture => {
  const caption = captionOf(people, lastHand, lead);

  return {
    also: Option.match(also, {
      onNone: () => "",
      onSome: (second) => {
        const seat = leadOf(second);

        const who =
          seat === undefined ? "" : personAt(people, lastHand, seat).name;

        return `${captionOf(people, lastHand, second).title} for ${who}`;
      },
    }),
    boards: lastHand.boards.map((board) => board.map(cardText)),
    faces: facesOf(people, lastHand, lead),
    kind: lead._tag,
    lifted: liftedOf(lead, lastHand).map(cardText),
    line: caption.line,
    painful: isPainful(lead),
    pot: lead.pot,
    tier: lead.tier,
    title: caption.title,
  };
};

export interface ShownMoment {
  readonly id: string;
  readonly picture: MomentPicture;
}

export const shownMomentOf = (hand: MomentHand): Option.Option<ShownMoment> => {
  const [first] = hand.record;

  if (
    first === undefined ||
    !Events.$is("HandStarted")(first) ||
    first.handNumber !== hand.lastHand.handNumber ||
    !handEnded(hand.record)
  ) {
    return Option.none();
  }

  return headline(momentsOf(hand.record), hand.callouts).pipe(
    Option.map((found) => ({
      id: [
        first.handNumber,
        found.lead._tag,
        found.lead.tier,
        found.lead.seats.join(","),
      ].join(":"),
      picture: pictureOf(hand.people, hand.lastHand, found),
    }))
  );
};
