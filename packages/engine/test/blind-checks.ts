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

export const dealProblems = (
  before: TableState,
  events: readonly Event[],
  after: TableState
): readonly string[] => {
  const started = events.find(Events.$is("HandStarted"));

  if (started === undefined || before.config.blindPosting !== "Casino") {
    return [];
  }

  const posts = entriesOf(events, started);
  const lastBig = lastBigOf(before, started);

  return SEAT_NUMBERS.flatMap((index) => {
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
};
