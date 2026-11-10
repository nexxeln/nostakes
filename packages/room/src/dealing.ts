import {
  CardSchema,
  Commands,
  DECK_SIZE,
  DeckSchema,
  Events,
  decide as decideTable,
} from "@nostakes/engine";
import type { Deck, SeatIndex, TableState } from "@nostakes/engine";
import { Option, Result } from "effect";

import type { RoomCommandOf } from "./commands.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import {
  DealNotDue,
  DealingIsAutomatic,
  GameAlready,
  ShuffleRanOut,
} from "./rejection.js";
import { SEATS, handInProgress, occupantAt } from "./state.js";
import type { Open } from "./state.js";
import { onTable } from "./table.js";
import { secondsAfter } from "./time.js";
import type { Millis } from "./time.js";

const BYTE_VALUES = 256;

export const deckFromBytes = (
  bytes: Uint8Array
): Result.Result<Deck, ShuffleRanOut> => {
  const cards = Array.from({ length: DECK_SIZE }, (_, card) =>
    CardSchema.make(card)
  );

  let cursor = 0;

  for (let top = DECK_SIZE - 1; top > 0; top -= 1) {
    const choices = top + 1;
    const fair = BYTE_VALUES - (BYTE_VALUES % choices);
    let drawn = -1;

    while (drawn < 0) {
      const byte = bytes[cursor];

      if (byte === undefined) {
        return Result.fail(new ShuffleRanOut({ given: bytes.length }));
      }

      cursor += 1;
      drawn = byte < fair ? byte % choices : -1;
    }

    const held = cards[top];
    const swapped = cards[drawn];

    if (held !== undefined && swapped !== undefined) {
      cards[top] = swapped;
      cards[drawn] = held;
    }
  }

  return Result.succeed(DeckSchema.make(cards));
};

export const dealableSeats = (table: TableState) =>
  SEATS.filter((seat) =>
    Option.exists(
      occupantAt(table, seat),
      (occupant) => !occupant.sittingOut && occupant.stack > 0
    )
  );

export const betweenHandsDue = (state: Open): Millis =>
  Option.match(state.clocks.lastHandEndedAt, {
    onNone: () => state.now,
    onSome: (ended) => secondsAfter(ended, state.settings.betweenHandsSeconds),
  });

const waitingForHost = (state: Open) =>
  state.settings.dealing === "Host" && !state.dealCalled;

export const dealDue = (state: Open) =>
  state.game === "Running" &&
  !handInProgress(state) &&
  !waitingForHost(state) &&
  dealableSeats(state.table).length >= 2
    ? Option.some(betweenHandsDue(state))
    : Option.none();

const cannotDeal = (state: Open) => {
  if (state.game === "Waiting") {
    return Option.some(
      new DealNotDue({ due: Option.none(), reason: "Waiting" })
    );
  }

  if (handInProgress(state)) {
    return Option.some(
      new DealNotDue({ due: Option.none(), reason: "HandInProgress" })
    );
  }

  return dealableSeats(state.table).length < 2
    ? Option.some(
        new DealNotDue({ due: Option.none(), reason: "TooFewPlayers" })
      )
    : Option.none();
};

const notDue = (state: Open, at: Millis) => {
  if (Option.isSome(state.sealed)) {
    return Option.some(
      new DealNotDue({ due: Option.none(), reason: "Sealed" })
    );
  }

  if (state.settings.shuffle === "Checked") {
    return Option.some(
      new DealNotDue({ due: Option.none(), reason: "NotSealed" })
    );
  }

  const blocked = cannotDeal(state);

  if (Option.isSome(blocked)) {
    return blocked;
  }

  if (waitingForHost(state)) {
    return Option.some(
      new DealNotDue({ due: Option.none(), reason: "WaitingForHost" })
    );
  }

  const due = betweenHandsDue(state);

  return at < due
    ? Option.some(new DealNotDue({ due: Option.some(due), reason: "TooEarly" }))
    : Option.none();
};

export const postingSeats = (state: Open): readonly SeatIndex[] =>
  SEATS.filter((seat) =>
    Option.exists(occupantAt(state.table, seat), (occupant) =>
      state.posters.includes(occupant.player)
    )
  );

const startHand = (
  state: Open,
  deck: Deck,
  straddles: readonly SeatIndex[],
  posts: readonly SeatIndex[]
) => decideTable(state.table, Commands.StartHand({ deck, posts, straddles }));

const clockwiseAfter = (seats: readonly SeatIndex[], after: SeatIndex) => [
  ...seats.filter((seat) => seat > after),
  ...seats.filter((seat) => seat <= after),
];

const leadingWhile = (
  seats: readonly SeatIndex[],
  keep: (seat: SeatIndex) => boolean
) => {
  const stop = seats.findIndex((seat) => !keep(seat));

  return stop === -1 ? seats : seats.slice(0, stop);
};

export const straddlesFor = (
  state: Open,
  deck: Deck,
  posts: readonly SeatIndex[]
): readonly SeatIndex[] => {
  const dryRun = startHand(state, deck, [], posts);

  const started = Result.isSuccess(dryRun)
    ? dryRun.success.find(Events.$is("HandStarted"))
    : undefined;

  if (started === undefined || state.straddlers.length === 0) {
    return [];
  }

  const declared = (seat: SeatIndex) =>
    Option.exists(occupantAt(state.table, seat), (occupant) =>
      state.straddlers.includes(occupant.player)
    );

  const rules = state.table.config.straddle;
  const afterBigBlind = clockwiseAfter(started.dealtIn, started.bigBlindSeat);

  const line = afterBigBlind.slice(
    0,
    afterBigBlind.indexOf(started.button) + 1
  );

  const chain = leadingWhile(line, declared).slice(0, rules.underTheGun);

  const candidates = [
    ...(rules.button && declared(started.button) ? [[started.button]] : []),
    ...chain.map((_, dropped) => chain.slice(0, chain.length - dropped)),
  ];

  return (
    candidates.find((straddles) =>
      Result.isSuccess(startHand(state, deck, straddles, posts))
    ) ?? []
  );
};

export const handStart = (
  state: Open,
  deck: Deck,
  posts: readonly SeatIndex[] = postingSeats(state)
) =>
  Commands.StartHand({
    deck,
    posts,
    straddles: straddlesFor(state, deck, posts),
  });

export const deal = (state: Open, command: RoomCommandOf<"Deal">): Decision =>
  Option.match(notDue(state, command.at), {
    onNone: () =>
      Result.flatMap(deckFromBytes(command.shuffleBytes), (deck) =>
        onTable(state.table, handStart(state, deck), command.at)
      ),
    onSome: (refusal) => Result.fail(refusal),
  });

export const startGame = (state: Open, at: Millis): Decision =>
  state.game === "Running"
    ? Result.fail(new GameAlready({ status: "Running" }))
    : Result.succeed([RoomEvents.GameStarted({ at })]);

export const pauseGame = (state: Open, at: Millis): Decision =>
  state.game === "Waiting"
    ? Result.fail(new GameAlready({ status: "Waiting" }))
    : Result.succeed([RoomEvents.GamePaused({ at })]);

export const callNextHand = (state: Open, at: Millis): Decision => {
  if (state.settings.dealing === "Automatic") {
    return Result.fail(
      new DealingIsAutomatic({
        betweenHandsSeconds: state.settings.betweenHandsSeconds,
      })
    );
  }

  return Option.match(cannotDeal(state), {
    onNone: () =>
      Result.succeed(
        state.dealCalled ? [] : [RoomEvents.NextHandCalled({ at })]
      ),
    onSome: (refusal) => Result.fail(refusal),
  });
};
