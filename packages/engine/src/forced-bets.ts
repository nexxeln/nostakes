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
import { Antes } from "./rules.js";
import type { TableConfig } from "./rules.js";
import {
  Phases,
  TableStates,
  isInHand,
  isOccupied,
  seatAtIndex,
  stackOf,
  updatePlayer,
  withHand,
  withStackChange,
} from "./state.js";
import type { HandPlayer, InHand, TableState } from "./state.js";

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

export const straddleAmount = (config: TableConfig, position: number) =>
  chips(config.bigBlind * 2 ** (position + 1));

const anteFrom = (config: TableConfig, stack: number) =>
  Antes.$is("EveryPlayer")(config.ante)
    ? Math.min(config.ante.amount, stack)
    : 0;

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

const straddleProblem = (
  state: TableState,
  dealtIn: Arr.NonEmptyReadonlyArray<SeatIndex>,
  button: SeatIndex,
  straddles: readonly SeatIndex[]
): Option.Option<StraddleProblem> => {
  const rules = state.config.straddle;
  const bigBlind = blindSeats(dealtIn, button).big;

  if (straddles.length === 0) {
    return Option.none();
  }

  if (dealtIn.length === 2) {
    return Option.some("HeadsUp");
  }

  const underTheGun =
    straddles.length <= rules.underTheGun &&
    isPrefixOf(straddles, underTheGunLine(dealtIn, bigBlind, button));

  const buttonAlone = straddles.length === 1 && straddles[0] === button;

  if (!underTheGun && !(buttonAlone && rules.button)) {
    if (buttonAlone) {
      return Option.some("ButtonStraddleOff");
    }

    if (rules.underTheGun === 0) {
      return Option.some("UnderTheGunOff");
    }

    return Option.some(
      straddles.length > rules.underTheGun ? "TooMany" : "OutOfTurn"
    );
  }

  const covered = straddles.every((seat, position) => {
    const stack = stackOf(state, seat);

    return (
      stack - anteFrom(state.config, stack) >
      straddleAmount(state.config, position)
    );
  });

  return covered ? Option.none() : Option.some("CannotCover");
};

const postings = (
  state: TableState,
  dealOrder: readonly SeatIndex[],
  blinds: { readonly big: SeatIndex; readonly small: SeatIndex },
  straddles: readonly SeatIndex[]
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
    left(seat) > 0
      ? [Events.BlindPosted({ ...take(seat, wanted), blind: kind, seat })]
      : [];

  return [
    ...antes,
    ...blind(blinds.small, "Small", state.config.smallBlind),
    ...blind(blinds.big, "Big", state.config.bigBlind),
    ...straddles.map((seat, position) =>
      Events.StraddlePosted({
        amount: take(seat, straddleAmount(state.config, position)).amount,
        seat,
      })
    ),
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

  const dealtIn = dealtInSeats(state);

  if (!Arr.isReadonlyArrayNonEmpty(dealtIn) || dealtIn.length < 2) {
    return Result.fail(new NotEnoughPlayers({ dealtIn }));
  }

  const button = nextButton(state.button, dealtIn);
  const blinds = blindSeats(dealtIn, button);
  const problem = straddleProblem(state, dealtIn, button, command.straddles);

  if (Option.isSome(problem)) {
    return Result.fail(
      new StraddleNotAllowed({
        reason: problem.value,
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
    ...postings(state, dealOrder, blinds, command.straddles),
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

export const beginHand = (
  state: TableState,
  event: EventOf<"HandStarted">
): TableState =>
  TableStates.InHand({
    button: event.button,
    config: state.config,
    hand: {
      bigBlindSeat: event.bigBlindSeat,
      board: [],
      deadMoney: NO_CHIPS,
      deck: event.deck,
      phase: Phases.Settling({ lastAggressor: Option.none() }),
      players: event.dealtIn.flatMap((seat) => dealtInPlayer(state, seat)),
      smallBlindSeat: event.smallBlindSeat,
      straddles: [],
      street: "Preflop",
    },
    handNumber: event.handNumber,
    seats: state.seats,
  });

export const whenInHand = (
  state: TableState,
  update: (inHand: InHand) => TableState
) => (isInHand(state) ? update(state) : state);

const commit = (
  state: InHand,
  seat: SeatIndex,
  amount: Chips,
  live: boolean
): InHand => {
  const seats = withStackChange(state.seats, seat, 0 - amount);
  const allIn = stackOf({ ...state, seats }, seat) === 0;

  return {
    ...state,
    hand: updatePlayer(state.hand, seat, (player) => ({
      ...player,
      committedThisStreet: live
        ? chips(player.committedThisStreet + amount)
        : player.committedThisStreet,
      committedTotal: chips(player.committedTotal + amount),
      status: allIn ? "AllIn" : player.status,
    })),
    seats,
  };
};

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
  whenInHand(state, (inHand) => commit(inHand, event.seat, event.amount, true));

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
