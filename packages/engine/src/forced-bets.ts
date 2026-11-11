import { Array as Arr, Option, Result } from "effect";

import { continueBetting, openRound } from "./betting.js";
import type { Card } from "./cards.js";
import type { CommandOf } from "./commands.js";
import { Events } from "./events.js";
import type { Event, EventOf } from "./events.js";
import { NO_CHIPS, SEAT_INDEXES, chips } from "./primitives.js";
import type { Chips, SeatIndex } from "./primitives.js";
import {
  HandInProgress,
  NotEnoughPlayers,
  StraddleNotAllowed,
} from "./rejection.js";
import type { StraddleProblem } from "./rejection.js";
import { Antes, straddleAmount } from "./rules.js";
import type { TableConfig } from "./rules.js";
import {
  NO_DEBT,
  Phases,
  TableStates,
  commit,
  isInHand,
  isOccupied,
  owesNothing,
  seatAtIndex,
  stackOf,
  updatePlayer,
  whenInHand,
  withHand,
  withStackChange,
} from "./state.js";
import type {
  BetweenHands,
  BlindDebt,
  Blinds,
  HandPlayer,
  InHand,
  Occupied,
  Seat,
  Straddle,
  TableState,
} from "./state.js";

export const dealtInSeats = (state: TableState) =>
  SEAT_INDEXES.filter((seat) => {
    const occupant = seatAtIndex(state, seat);

    return isOccupied(occupant) && !occupant.sittingOut && occupant.stack > 0;
  });

const clockwiseFrom = (
  dealtIn: Arr.NonEmptyReadonlyArray<SeatIndex>,
  after: SeatIndex
) => [
  ...dealtIn.filter((seat) => seat > after),
  ...dealtIn.filter((seat) => seat <= after),
];

const nextAmong = (
  dealtIn: Arr.NonEmptyReadonlyArray<SeatIndex>,
  after: SeatIndex
) => dealtIn.find((seat) => seat > after) ?? dealtIn[0];

export const nextButton = (
  previous: Option.Option<SeatIndex>,
  dealtIn: Arr.NonEmptyReadonlyArray<SeatIndex>
) =>
  Option.match(previous, {
    onNone: () => dealtIn[0],
    onSome: (seat) => nextAmong(dealtIn, seat),
  });

export const blindSeats = (
  dealtIn: Arr.NonEmptyReadonlyArray<SeatIndex>,
  button: SeatIndex
) => {
  const small = dealtIn.length === 2 ? button : nextAmong(dealtIn, button);

  return { big: nextAmong(dealtIn, small), small };
};

const anteFrom = (config: TableConfig, stack: number) =>
  Antes.$is("EveryPlayer")(config.ante)
    ? Math.min(config.ante.amount, stack)
    : 0;

interface Positions {
  readonly big: SeatIndex;
  readonly button: SeatIndex;
  readonly small: SeatIndex;
}

const movingPositions = (
  state: BetweenHands,
  dealtIn: Arr.NonEmptyReadonlyArray<SeatIndex>
): Positions => {
  const button = nextButton(state.button, dealtIn);

  return { button, ...blindSeats(dealtIn, button) };
};

const deadButtonPositions = (
  state: BetweenHands,
  dealtIn: Arr.NonEmptyReadonlyArray<SeatIndex>,
  last: Blinds
): Positions => {
  const big = nextAmong(dealtIn, last.big);

  if (dealtIn.length === 2) {
    const other = dealtIn.find((seat) => seat !== big) ?? big;

    return { big, button: other, small: other };
  }

  return big === last.small
    ? movingPositions(state, dealtIn)
    : { big, button: last.small, small: last.big };
};

const positionsAmong = (
  state: BetweenHands,
  dealtIn: Arr.NonEmptyReadonlyArray<SeatIndex>
): Positions =>
  state.config.blindPosting === "Casino"
    ? Option.match(state.lastBlinds, {
        onNone: () => movingPositions(state, dealtIn),
        onSome: (last) => deadButtonPositions(state, dealtIn, last),
      })
    : movingPositions(state, dealtIn);

export interface EntryPost {
  readonly dead: Chips;
  readonly live: Chips;
  readonly seat: SeatIndex;
}

const owedPosts = (config: TableConfig, debt: BlindDebt) => ({
  dead: chips(debt.small ? config.smallBlind : 0),
  live: chips(debt.big || debt.entry ? config.bigBlind : 0),
});

const occupantAt = (
  state: TableState,
  seat: SeatIndex
): Occupied | undefined => {
  const occupant = seatAtIndex(state, seat);

  return isOccupied(occupant) ? occupant : undefined;
};

const postsToEnter = (
  state: TableState,
  posting: readonly SeatIndex[],
  seat: SeatIndex
) => {
  const occupant = occupantAt(state, seat);

  if (occupant === undefined || !posting.includes(seat)) {
    return false;
  }

  const { dead, live } = owedPosts(state.config, occupant.owes);

  return occupant.stack - anteFrom(state.config, occupant.stack) > dead + live;
};

const clockwiseDistance = (from: SeatIndex, to: SeatIndex) =>
  (to - from + SEAT_INDEXES.length) % SEAT_INDEXES.length;

const strictlyBetween = (from: SeatIndex, to: SeatIndex, seat: SeatIndex) =>
  clockwiseDistance(from, seat) > 0 &&
  clockwiseDistance(from, seat) < clockwiseDistance(from, to);

const behindTheBlinds = (at: Positions, seat: SeatIndex) =>
  seat === at.button ||
  seat === at.small ||
  strictlyBetween(at.button, at.small, seat);

const placedWell = (
  state: TableState,
  posting: readonly SeatIndex[],
  seat: SeatIndex,
  at: Positions
) =>
  postsToEnter(state, posting, seat)
    ? !behindTheBlinds(at, seat)
    : seat === at.big;

const sortedSeats = (seats: readonly SeatIndex[]) =>
  seats.toSorted((left, right) => left - right);

const owesSomething = (state: TableState, seat: SeatIndex) =>
  !owesNothing(occupantAt(state, seat)?.owes ?? NO_DEBT);

const settled = (
  state: BetweenHands,
  posting: readonly SeatIndex[],
  dealt: Arr.NonEmptyReadonlyArray<SeatIndex>
): Arr.NonEmptyReadonlyArray<SeatIndex> => {
  const at = positionsAmong(state, dealt);

  const kept = dealt.filter(
    (seat) =>
      !owesSomething(state, seat) || placedWell(state, posting, seat, at)
  );

  return kept.length === dealt.length || !Arr.isReadonlyArrayNonEmpty(kept)
    ? dealt
    : settled(state, posting, kept);
};

export interface Deal {
  readonly dealtIn: readonly SeatIndex[];
  readonly forgiven: boolean;
}

const casinoDeal = (
  state: BetweenHands,
  posting: readonly SeatIndex[]
): Deal => {
  const playable = dealtInSeats(state);
  const square = playable.filter((seat) => !owesSomething(state, seat));

  if (!Arr.isReadonlyArrayNonEmpty(square) || square.length < 2) {
    return { dealtIn: playable, forgiven: true };
  }

  const owing = playable.filter((seat) => !square.includes(seat));

  if (!Arr.isReadonlyArrayNonEmpty(owing)) {
    return { dealtIn: square, forgiven: false };
  }

  const start = positionsAmong(state, square).small;
  let dealt: Arr.NonEmptyReadonlyArray<SeatIndex> = square;

  for (const seat of clockwiseFrom(owing, start)) {
    const trial = sortedSeats([...dealt, seat]);

    if (
      Arr.isReadonlyArrayNonEmpty(trial) &&
      placedWell(state, posting, seat, positionsAmong(state, trial))
    ) {
      dealt = trial;
    }
  }

  return { dealtIn: settled(state, posting, dealt), forgiven: false };
};

const dealFor = (state: BetweenHands, posting: readonly SeatIndex[]): Deal =>
  state.config.blindPosting === "Casino"
    ? casinoDeal(state, posting)
    : { dealtIn: dealtInSeats(state), forgiven: false };

const entryPosts = (
  state: TableState,
  deal: Deal,
  big: SeatIndex
): readonly EntryPost[] =>
  deal.forgiven
    ? []
    : deal.dealtIn.flatMap((seat) => {
        const occupant = occupantAt(state, seat);

        return occupant === undefined ||
          seat === big ||
          owesNothing(occupant.owes)
          ? []
          : [{ ...owedPosts(state.config, occupant.owes), seat }];
      });

const underTheGunLine = (
  dealtIn: Arr.NonEmptyReadonlyArray<SeatIndex>,
  bigBlind: SeatIndex,
  button: SeatIndex
) => {
  const after = clockwiseFrom(dealtIn, bigBlind);

  return after.slice(0, after.indexOf(button) + 1);
};

const isPrefixOf = (
  straddles: readonly SeatIndex[],
  line: readonly SeatIndex[]
) => straddles.every((seat, position) => line[position] === seat);

const coveredStraddle = (
  state: TableState,
  seat: SeatIndex,
  position: number
): Option.Option<Straddle> => {
  const stack = stackOf(state, seat);

  return straddleAmount(state.config, position).pipe(
    Option.filter((amount) => stack - anteFrom(state.config, stack) > amount),
    Option.map((amount) => ({ amount, seat }))
  );
};

const lineProblem = (
  state: TableState,
  dealtIn: Arr.NonEmptyReadonlyArray<SeatIndex>,
  at: Positions,
  straddles: readonly SeatIndex[]
): Option.Option<StraddleProblem> => {
  const rules = state.config.straddle;
  const { big: bigBlind, button } = at;

  if (dealtIn.length === 2) {
    return Option.some("HeadsUp");
  }

  const underTheGun =
    straddles.length <= rules.underTheGun &&
    isPrefixOf(straddles, underTheGunLine(dealtIn, bigBlind, button));

  const buttonAlone =
    straddles.length === 1 &&
    straddles[0] === button &&
    dealtIn.includes(button);

  if (underTheGun || (buttonAlone && rules.button)) {
    return Option.none();
  }

  if (buttonAlone) {
    return Option.some("ButtonStraddleOff");
  }

  if (rules.underTheGun === 0) {
    return Option.some("UnderTheGunOff");
  }

  return Option.some(
    straddles.length > rules.underTheGun ? "TooMany" : "OutOfTurn"
  );
};

const validStraddles = (
  state: TableState,
  dealtIn: Arr.NonEmptyReadonlyArray<SeatIndex>,
  at: Positions,
  straddles: readonly SeatIndex[]
): Result.Result<readonly Straddle[], StraddleProblem> => {
  if (straddles.length === 0) {
    return Result.succeed([]);
  }

  const problem = lineProblem(state, dealtIn, at, straddles);

  if (Option.isSome(problem)) {
    return Result.fail(problem.value);
  }

  return Result.fromOption(
    Option.all(
      straddles.map((seat, position) => coveredStraddle(state, seat, position))
    ),
    (): StraddleProblem => "CannotCover"
  );
};

const postings = (
  state: TableState,
  dealOrder: readonly SeatIndex[],
  blinds: { readonly big: SeatIndex; readonly small: SeatIndex },
  straddles: readonly Straddle[],
  entries: readonly EntryPost[]
): readonly Event[] => {
  const remaining = new Map(
    dealOrder.map((seat) => [seat, stackOf(state, seat)])
  );

  const left = (seat: SeatIndex) => remaining.get(seat) ?? 0;

  const take = (seat: SeatIndex, wanted: number) => {
    const amount = Math.min(wanted, left(seat));

    remaining.set(seat, left(seat) - amount);

    return { allIn: left(seat) === 0, amount: chips(amount) };
  };

  const antes = Antes.$match(state.config.ante, {
    BigBlindPays: (ante) => {
      const anteAmount = Math.min(
        ante.amount,
        left(blinds.big) - Math.min(state.config.bigBlind, left(blinds.big))
      );

      return anteAmount > 0
        ? [
            Events.AntePosted({
              ...take(blinds.big, anteAmount),
              seat: blinds.big,
            }),
          ]
        : [];
    },
    EveryPlayer: (ante) =>
      dealOrder.map((seat) =>
        Events.AntePosted({ ...take(seat, ante.amount), seat })
      ),
    NoAnte: () => [],
  });

  const blind = (seat: SeatIndex, kind: "Small" | "Big", wanted: Chips) =>
    left(seat) > 0 && dealOrder.includes(seat)
      ? [Events.BlindPosted({ ...take(seat, wanted), blind: kind, seat })]
      : [];

  return [
    ...antes,
    ...blind(blinds.small, "Small", state.config.smallBlind),
    ...blind(blinds.big, "Big", state.config.bigBlind),
    ...straddles.map((straddle) =>
      Events.StraddlePosted({
        amount: take(straddle.seat, straddle.amount).amount,
        seat: straddle.seat,
      })
    ),
    ...entries.flatMap((entry) => [
      ...(entry.live > 0
        ? [
            Events.BlindPosted({
              ...take(entry.seat, entry.live),
              blind: "Big",
              seat: entry.seat,
            }),
          ]
        : []),
      ...(entry.dead > 0
        ? [
            Events.BlindPosted({
              ...take(entry.seat, entry.dead),
              blind: "Small",
              dead: true,
              seat: entry.seat,
            }),
          ]
        : []),
    ]),
  ];
};

const holeCards = (deck: readonly Card[], dealOrder: readonly SeatIndex[]) =>
  dealOrder.map((seat, index) =>
    Events.HoleCardsDealt({
      cards: [deck[index], deck[dealOrder.length + index]].filter(
        (card) => card !== undefined
      ),
      seat,
    })
  );

export const startHand = (
  state: TableState,
  command: CommandOf<"StartHand">
) => {
  if (isInHand(state)) {
    return Result.fail(new HandInProgress({ handNumber: state.handNumber }));
  }

  const deal = dealFor(state, command.posts ?? []);
  const { dealtIn } = deal;

  if (!Arr.isReadonlyArrayNonEmpty(dealtIn) || dealtIn.length < 2) {
    return Result.fail(new NotEnoughPlayers({ dealtIn }));
  }

  const at = positionsAmong(state, dealtIn);
  const { button, ...blinds } = at;
  const entries = entryPosts(state, deal, blinds.big);

  const straddles = command.straddles.some((seat) =>
    entries.some((entry) => entry.seat === seat)
  )
    ? Result.fail<StraddleProblem>("PostingToEnter")
    : validStraddles(state, dealtIn, at, command.straddles);

  if (Result.isFailure(straddles)) {
    return Result.fail(
      new StraddleNotAllowed({
        reason: straddles.failure,
        straddles: command.straddles,
      })
    );
  }

  const dealOrder = clockwiseFrom(dealtIn, button);

  return Result.succeed([
    Events.HandStarted({
      bigBlindSeat: blinds.big,
      button,
      dealtIn,
      deck: command.deck,
      handNumber: state.handNumber + 1,
      smallBlindSeat: blinds.small,
    }),
    ...postings(state, dealOrder, blinds, straddles.success, entries),
    ...holeCards(command.deck, dealOrder),
  ]);
};

const dealtInPlayer = (state: TableState, seat: SeatIndex): HandPlayer[] => {
  const occupant = seatAtIndex(state, seat);

  return isOccupied(occupant)
    ? [
        {
          committedThisStreet: NO_CHIPS,
          committedTotal: NO_CHIPS,
          holeCards: [],
          mucked: false,
          player: occupant.player,
          publicCards: [],
          seat,
          status: "Active",
          won: NO_CHIPS,
        },
      ]
    : [];
};

const lastBigOf = (state: TableState, event: EventOf<"HandStarted">) =>
  TableStates.$is("BetweenHands")(state)
    ? Option.match(state.lastBlinds, {
        onNone: () => event.smallBlindSeat,
        onSome: (last) => last.big,
      })
    : event.smallBlindSeat;

const debtAfter = (
  state: TableState,
  event: EventOf<"HandStarted">,
  seat: SeatIndex,
  owes: BlindDebt
): BlindDebt => {
  if (event.dealtIn.includes(seat)) {
    return NO_DEBT;
  }

  if (state.config.blindPosting !== "Casino" || owes.entry) {
    return owes;
  }

  const passed = strictlyBetween(
    lastBigOf(state, event),
    event.bigBlindSeat,
    seat
  );

  return {
    ...owes,
    big: owes.big || passed,
    small: owes.small || passed || seat === event.smallBlindSeat,
  };
};

const seatsAfterDeal = (
  state: TableState,
  event: EventOf<"HandStarted">
): readonly Seat[] =>
  state.seats.map((seat, index) => {
    const at = SEAT_INDEXES[index];

    return isOccupied(seat) && at !== undefined
      ? { ...seat, owes: debtAfter(state, event, at, seat.owes) }
      : seat;
  });

export const clearDebtsAtHome = (state: TableState): TableState =>
  state.config.blindPosting === "HomeGame"
    ? {
        ...state,
        seats: state.seats.map((seat) =>
          isOccupied(seat) ? { ...seat, owes: NO_DEBT } : seat
        ),
      }
    : state;

export const beginHand = (
  state: TableState,
  event: EventOf<"HandStarted">
): TableState =>
  TableStates.InHand({
    button: event.button,
    config: state.config,
    hand: {
      aggressor: Option.none(),
      beaten: [],
      bigBlindSeat: event.bigBlindSeat,
      board: [],
      deadMoney: NO_CHIPS,
      deck: event.deck,
      phase: Phases.Settling({ lastAggressor: Option.none() }),
      players: event.dealtIn.flatMap((seat) => dealtInPlayer(state, seat)),
      smallBlindSeat: event.smallBlindSeat,
      straddles: [],
      street: "Preflop",
      wonAlone: [],
    },
    handNumber: event.handNumber,
    seats: seatsAfterDeal(state, event),
  });

export const postAnte = (state: TableState, event: EventOf<"AntePosted">) =>
  whenInHand(state, (inHand) => {
    if (!Antes.$is("BigBlindPays")(inHand.config.ante)) {
      return commit(inHand, event.seat, event.amount, false);
    }

    return {
      ...inHand,
      hand: {
        ...inHand.hand,
        deadMoney: chips(inHand.hand.deadMoney + event.amount),
      },
      seats: withStackChange(inHand.seats, event.seat, 0 - event.amount),
    };
  });

export const postBlind = (state: TableState, event: EventOf<"BlindPosted">) =>
  whenInHand(state, (inHand) =>
    event.dead === true
      ? {
          ...inHand,
          hand: {
            ...inHand.hand,
            deadMoney: chips(inHand.hand.deadMoney + event.amount),
          },
          seats: withStackChange(inHand.seats, event.seat, 0 - event.amount),
        }
      : commit(inHand, event.seat, event.amount, true)
  );

export const postStraddle = (
  state: TableState,
  event: EventOf<"StraddlePosted">
) =>
  whenInHand(state, (inHand) => {
    const posted = commit(inHand, event.seat, event.amount, true);

    return withHand(posted, {
      ...posted.hand,
      straddles: [
        ...posted.hand.straddles,
        { amount: event.amount, seat: event.seat },
      ],
    });
  });

const openPreflop = (state: InHand): InHand => {
  const lastStraddle = state.hand.straddles.at(-1);
  const reference = lastStraddle?.seat ?? state.hand.bigBlindSeat;
  const bet = lastStraddle?.amount ?? state.config.bigBlind;

  return withHand(state, {
    ...state.hand,
    phase: continueBetting(
      state.config,
      state.hand,
      openRound(bet, bet),
      reference
    ),
  });
};

export const dealHoleCards = (
  state: TableState,
  event: EventOf<"HoleCardsDealt">
) =>
  whenInHand(state, (inHand) => {
    const dealt = updatePlayer(inHand.hand, event.seat, (player) => ({
      ...player,
      holeCards: event.cards,
    }));

    const hand = {
      ...dealt,
      deck: dealt.deck.filter((card) => !event.cards.includes(card)),
    };

    const next = withHand(inHand, hand);

    return hand.players.every((player) => player.holeCards.length > 0)
      ? openPreflop(next)
      : next;
  });
