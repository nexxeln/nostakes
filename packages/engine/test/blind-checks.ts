import { Option } from "effect";

import {
  Events,
  NO_DEBT,
  SEAT_COUNT,
  Seats,
  TableStates,
} from "../src/index.js";
import type { BlindDebt, Event, TableState } from "../src/index.js";

type HandStart = Extract<Event, { readonly _tag: "HandStarted" }>;

interface Entry {
  readonly dead: number;
  readonly live: number;
  readonly seat: number;
}

const entriesOf = (
  events: readonly Event[],
  started: HandStart
): readonly Entry[] => {
  const entries = new Map<number, Entry>();

  for (const event of events) {
    if (
      Events.$is("BlindPosted")(event) &&
      (event.dead === true ||
        (event.blind === "Big" && event.seat !== started.bigBlindSeat))
    ) {
      const earlier = entries.get(event.seat) ?? {
        dead: 0,
        live: 0,
        seat: event.seat,
      };

      entries.set(
        event.seat,
        event.dead === true
          ? { ...earlier, dead: earlier.dead + event.amount }
          : { ...earlier, live: earlier.live + event.amount }
      );
    }
  }

  return [...entries.values()];
};

const clockwise = (from: number, to: number) =>
  (to - from + SEAT_COUNT) % SEAT_COUNT;

const between = (from: number, to: number, seat: number) =>
  clockwise(from, seat) > 0 && clockwise(from, seat) < clockwise(from, to);

const occupantAt = (state: TableState, index: number) => {
  const held = state.seats[index];

  return held !== undefined && Seats.$is("Occupied")(held) ? held : undefined;
};

const owesAnything = (debt: BlindDebt) => debt.big || debt.small || debt.entry;

const SEAT_NUMBERS = Array.from({ length: SEAT_COUNT }, (_, index) => index);

const lastBigOf = (before: TableState, started: HandStart): number =>
  TableStates.$is("BetweenHands")(before)
    ? Option.match(before.lastBlinds, {
        onNone: () => started.smallBlindSeat,
        onSome: (last) => last.big,
      })
    : started.smallBlindSeat;

const forgivenDeal = (before: TableState) =>
  SEAT_NUMBERS.filter((index) => {
    const occupant = occupantAt(before, index);

    return (
      occupant !== undefined &&
      !occupant.sittingOut &&
      occupant.stack > 0 &&
      !owesAnything(occupant.owes)
    );
  }).length < 2;

const behindTheBlinds = (started: HandStart, index: number) =>
  index === started.button ||
  index === started.smallBlindSeat ||
  between(started.button, started.smallBlindSeat, index);

const sittingOutProblems = (
  started: HandStart,
  lastBig: number,
  index: number,
  owed: BlindDebt,
  owesAfter: BlindDebt
): readonly string[] => {
  const missedBig = between(lastBig, started.bigBlindSeat, index);
  const missedSmall = missedBig || index === started.smallBlindSeat;

  return !owed.entry &&
    ((missedBig && !owesAfter.big) || (missedSmall && !owesAfter.small))
    ? [
        `seat ${index} sat out a passing blind and owes ${JSON.stringify(owesAfter)}`,
      ]
    : [];
};

const expectedPost = (
  before: TableState,
  started: HandStart,
  index: number,
  owed: BlindDebt
) =>
  forgivenDeal(before) || !owesAnything(owed) || index === started.bigBlindSeat
    ? "nothing"
    : `${owed.big || owed.entry ? before.config.bigBlind : 0} live and ${owed.small ? before.config.smallBlind : 0} dead`;

const dealtInProblems = (
  before: TableState,
  started: HandStart,
  index: number,
  post: Entry | undefined,
  owesAfter: BlindDebt
): readonly string[] => {
  const owed = occupantAt(before, index)?.owes ?? NO_DEBT;
  const expected = expectedPost(before, started, index, owed);

  const actual =
    post === undefined ? "nothing" : `${post.live} live and ${post.dead} dead`;

  return [
    ...(expected === actual
      ? []
      : [
          `seat ${index} owed ${JSON.stringify(owed)}, posted ${actual}, expected ${expected}`,
        ]),
    ...(post !== undefined && behindTheBlinds(started, index)
      ? [
          `seat ${index} posted to come in between the button and the small blind`,
        ]
      : []),
    ...(owesAnything(owesAfter)
      ? [`seat ${index} was dealt in and still owes`]
      : []),
  ];
};

const rotationProblems = (
  before: TableState,
  started: HandStart
): readonly string[] => {
  if (!TableStates.$is("BetweenHands")(before) || forgivenDeal(before)) {
    return [];
  }

  return Option.match(before.lastBlinds, {
    onNone: () => [],
    onSome: (last) => {
      const stayed = Option.match(before.lastHand, {
        onNone: () => [],
        onSome: (lastHand) =>
          lastHand.players
            .map((dealt) => dealt.seat)
            .filter((index) => started.dealtIn.includes(index)),
      });

      return [
        ...stayed
          .filter((index) => between(last.big, started.bigBlindSeat, index))
          .map((index) => `the big blind skipped seat ${index}`),
        ...(started.bigBlindSeat === last.big &&
        stayed.some((index) => index !== last.big)
          ? [`seat ${last.big} is the big blind twice in a row`]
          : []),
      ];
    },
  });
};

const seatProblems = (
  before: TableState,
  started: HandStart,
  posts: readonly Entry[],
  lastBig: number,
  after: TableState
): readonly string[] =>
  SEAT_NUMBERS.flatMap((index) => {
    const occupant = occupantAt(before, index);

    if (occupant === undefined) {
      return [];
    }

    const post = posts.find((posted) => posted.seat === index);
    const owesAfter = occupantAt(after, index)?.owes ?? NO_DEBT;

    return started.dealtIn.some((dealt) => dealt === index)
      ? dealtInProblems(before, started, index, post, owesAfter)
      : [
          ...(post === undefined
            ? []
            : [`seat ${index} posted without a hand`]),
          ...sittingOutProblems(
            started,
            lastBig,
            index,
            occupant.owes,
            owesAfter
          ),
        ];
  });

export type Orbits = ReadonlyMap<string, number>;

export const NO_ORBITS: Orbits = new Map();

export const orbitsAfter = (
  orbits: Orbits,
  before: TableState,
  events: readonly Event[]
) => {
  const started = events.find(Events.$is("HandStarted"));
  const problems: string[] = [];

  if (started === undefined || started.bombPot !== undefined) {
    return { orbits, problems };
  }

  if (before.config.blindPosting !== "Casino" || forgivenDeal(before)) {
    return { orbits: NO_ORBITS, problems };
  }

  const posts = entriesOf(events, started);
  const next = new Map<string, number>();

  for (const index of SEAT_NUMBERS) {
    const occupant = occupantAt(before, index);

    if (occupant !== undefined) {
      const dealt = started.dealtIn.some((seat) => seat === index);

      const paid =
        dealt &&
        (index === started.bigBlindSeat ||
          index === started.smallBlindSeat ||
          posts.some((posted) => posted.seat === index));

      const buttonsSincePaid = paid
        ? 0
        : (orbits.get(occupant.player) ?? 0) +
          (dealt && index === started.button ? 1 : 0);

      next.set(occupant.player, buttonsSincePaid);

      if (buttonsSincePaid >= 2) {
        problems.push(
          `seat ${index} held the button twice without paying a blind`
        );
      }
    }
  }

  const counted: Orbits = next;

  return { orbits: counted, problems };
};

const bombPotProblems = (
  before: TableState,
  events: readonly Event[],
  after: TableState
): readonly string[] => [
  ...(events.some(
    (event) =>
      Events.$is("BlindPosted")(event) || Events.$is("StraddlePosted")(event)
  )
    ? ["a bomb pot posted a blind or a straddle"]
    : []),
  ...SEAT_NUMBERS.flatMap((index) => {
    const owed = occupantAt(before, index)?.owes ?? NO_DEBT;
    const owesAfter = occupantAt(after, index)?.owes ?? NO_DEBT;

    return JSON.stringify(owed) === JSON.stringify(owesAfter)
      ? []
      : [
          `a bomb pot changed what seat ${index} owes from ${JSON.stringify(owed)} to ${JSON.stringify(owesAfter)}`,
        ];
  }),
];

export const dealProblems = (
  before: TableState,
  events: readonly Event[],
  after: TableState
): readonly string[] => {
  const started = events.find(Events.$is("HandStarted"));

  if (started !== undefined && started.bombPot !== undefined) {
    return bombPotProblems(before, events, after);
  }

  if (started === undefined || before.config.blindPosting !== "Casino") {
    return [];
  }

  const posts = entriesOf(events, started);
  const lastBig = lastBigOf(before, started);

  return [
    ...rotationProblems(before, started),
    ...seatProblems(before, started, posts, lastBig, after),
  ];
};
