import {
  CardSchema as TableCardSchema,
  Commands,
  DeckSchema as TableDeckSchema,
  Events,
  decide as decideTable,
} from "@nostakes/engine";
import type { Deck as TableDeck, SeatIndex } from "@nostakes/engine";
import {
  CardSchema as SealedCardSchema,
  DeckSchema as SealedDeckSchema,
  DIGEST_BYTES,
  SaltSecretSchema,
  openSpare,
  roundToSeal,
  sealHand,
  verifyBeacon,
} from "@nostakes/shuffle";
import type {
  Beacon,
  BeaconRound,
  Deck as SealedDeck,
} from "@nostakes/shuffle";
import { Option, Result } from "effect";

import { andThen, inSequence } from "./batch.js";
import type { Step } from "./batch.js";
import { SealedDealSources } from "./commands.js";
import type { RoomCommandOf } from "./commands.js";
import {
  betweenHandsDue,
  dealDue,
  dealableSeats,
  deckFromBytes,
  handStart,
  postingSeats,
} from "./dealing.js";
import type { Decision } from "./decision.js";
import { RoomEvents } from "./events.js";
import type { RoomEvent, WithdrawalReason } from "./events.js";
import type { RoomRejection } from "./rejection.js";
import {
  BeaconRejected,
  BeaconRoundWrong,
  DealNotDue,
  NothingSealed,
  SaltSecretSize,
  SealNotDue,
  SealRoundTooSoon,
  SealedSeatsMoved,
  TableRejected,
} from "./rejection.js";
import {
  contextOf,
  dealtDeck,
  epochOf,
  planOf,
  roundAt,
  sealLeadMs,
  sealedHandOf,
  stillWithdrawable,
  withdrawal,
} from "./sealed-hand.js";
import { Attendances, handInProgress, occupantAt } from "./state.js";
import type { Open, Sealed } from "./state.js";
import { onTable } from "./table.js";
import { latest, millis } from "./time.js";
import type { Millis } from "./time.js";

const nextHandNumber = (state: Open) => state.table.handNumber + 1;

export const sealedDealDue = (state: Open) =>
  state.sealed.pipe(
    Option.map((sealed) => ({
      at: latest(betweenHandsDue(state), roundAt(state.chain, sealed.round)),
      round: sealed.round,
    }))
  );

export const sealDue = (state: Open): Option.Option<Millis> =>
  state.settings.shuffle === "Checked" && Option.isNone(state.sealed)
    ? Option.map(dealDue(state), (due) =>
        latest(state.now, millis(Math.max(0, due - sealLeadMs(state.chain))))
      )
    : Option.none();

const dealOrderOf = (
  state: Open,
  deck: TableDeck,
  posts: readonly SeatIndex[] = postingSeats(state)
): Result.Result<readonly SeatIndex[], TableRejected> =>
  Result.mapBoth(
    decideTable(
      state.table,
      Commands.StartHand({ deck, posts, straddles: [] })
    ),
    {
      onFailure: (rejection) => new TableRejected({ rejection }),
      onSuccess: (events): readonly SeatIndex[] => {
        const started = events.find(Events.$is("HandStarted"));

        if (started === undefined) {
          return [];
        }

        const { button, dealtIn } = started;

        return [
          ...dealtIn.filter((seat) => seat > button),
          ...dealtIn.filter((seat) => seat <= button),
        ];
      },
    }
  );

const sealedDeckFrom = (bytes: Uint8Array) =>
  Result.map(deckFromBytes(bytes), (deck) =>
    SealedDeckSchema.make(deck.map((card) => SealedCardSchema.make(card)))
  );

const sealNotDue = (state: Open, at: Millis) => {
  if (state.settings.shuffle !== "Checked") {
    return Option.some(new SealNotDue({ due: Option.none(), reason: "Plain" }));
  }

  if (Option.isSome(state.sealed)) {
    return Option.some(
      new SealNotDue({ due: Option.none(), reason: "AlreadySealed" })
    );
  }

  const due = sealDue(state);

  if (Option.isNone(due)) {
    return Option.some(
      new SealNotDue({ due: Option.none(), reason: "NoDealComing" })
    );
  }

  return at < due.value
    ? Option.some(new SealNotDue({ due, reason: "TooEarly" }))
    : Option.none();
};

const onTableOrder = (state: Open, deck: TableDeck) =>
  Result.mapError(
    dealOrderOf(state, deck),
    () =>
      new SealNotDue({
        due: Option.none(),
        reason: "NoDealComing",
      })
  );

export const sealNextHand = (
  state: Open,
  command: RoomCommandOf<"SealHand">
): Decision =>
  Result.gen(function* sealTheNextHand() {
    const refusal = sealNotDue(state, command.at);

    if (Option.isSome(refusal)) {
      return yield* Result.fail(refusal.value);
    }

    const earliest = roundToSeal(state.chain, epochOf(command.at));

    if (command.round < earliest) {
      return yield* Result.fail(
        new SealRoundTooSoon({ earliest, round: command.round })
      );
    }

    if (command.secret.length !== DIGEST_BYTES) {
      return yield* Result.fail(
        new SaltSecretSize({ bytes: command.secret.length })
      );
    }

    const first = yield* sealedDeckFrom(command.decks[0]);
    const second = yield* sealedDeckFrom(command.decks[1]);
    const decks: readonly [SealedDeck, SealedDeck] = [first, second];
    const tableDeck = TableDeckSchema.make([...first]);
    const seats = yield* onTableOrder(state, tableDeck);
    const secret = SaltSecretSchema.make(command.secret);
    const hand = nextHandNumber(state);

    const sealed = sealHand(
      contextOf(state.code, hand),
      decks,
      secret,
      command.round,
      seats
    );

    return [
      RoomEvents.HandSealed({
        at: command.at,
        decks,
        hand,
        roots: sealed.seal.roots,
        round: command.round,
        seats,
        secret,
      }),
    ];
  });

const sittingOutChange =
  (seat: SeatIndex, sittingOut: boolean, at: Millis): Step =>
  (state) =>
    onTable(state.table, Commands.SetSittingOut({ seat, sittingOut }), at);

const sameOrder = (left: readonly SeatIndex[], right: readonly SeatIndex[]) =>
  left.length === right.length &&
  left.every((seat, index) => seat === right[index]);

const startSealed =
  (sealed: Sealed, deck: TableDeck, at: Millis): Step =>
  (state) =>
    Result.flatMap(dealOrderOf(state, deck, sealed.seats), (order): Decision =>
      sameOrder(order, sealed.seats)
        ? onTable(state.table, handStart(state, deck, sealed.seats), at)
        : Result.fail(
            new SealedSeatsMoved({ dealt: order, sealed: sealed.seats })
          )
    );

const dealToSealedSeats = (
  state: Open,
  sealed: Sealed,
  deck: TableDeck,
  at: Millis
): Decision => {
  const heldOut = dealableSeats(state.table).filter(
    (seat) => !sealed.seats.includes(seat)
  );

  const broughtIn = sealed.seats.filter((seat) =>
    Option.exists(
      occupantAt(state.table, seat),
      (occupant) => occupant.sittingOut
    )
  );

  return inSequence(state, [
    ...heldOut.map((seat) => sittingOutChange(seat, true, at)),
    ...broughtIn.map((seat) => sittingOutChange(seat, false, at)),
    startSealed(sealed, deck, at),
    ...heldOut.map((seat) => sittingOutChange(seat, false, at)),
    ...broughtIn.map((seat) => sittingOutChange(seat, true, at)),
  ]);
};

const verifiedBeacon = (
  state: Open,
  sealed: Sealed,
  round: BeaconRound,
  signature: Uint8Array
): Result.Result<Beacon, BeaconRejected | BeaconRoundWrong> =>
  round === sealed.round
    ? Result.mapError(
        verifyBeacon(state.chain, round, signature),
        (failure) => new BeaconRejected({ reason: failure._tag, round })
      )
    : Result.fail(new BeaconRoundWrong({ given: round, sealed: sealed.round }));

interface SealedDeal {
  readonly event: RoomEvent;
  readonly deck: TableDeck;
}

const dealingEvent = (
  state: Open,
  sealed: Sealed,
  command: RoomCommandOf<"DealSealed">
): Result.Result<SealedDeal, RoomRejection> =>
  SealedDealSources.$match(command.source, {
    BeaconUnavailable: ({
      shuffleBytes,
    }): Result.Result<SealedDeal, RoomRejection> =>
      Result.map(deckFromBytes(shuffleBytes), (deck) => ({
        deck,
        event: RoomEvents.DealtWithoutBeacon({
          at: command.at,
          hand: sealed.hand,
          reason: "BeaconUnavailable",
          round: sealed.round,
        }),
      })),
    FromBeacon: ({
      round,
      signature,
    }): Result.Result<SealedDeal, RoomRejection> =>
      Result.map(verifiedBeacon(state, sealed, round, signature), (beacon) => {
        const plan = planOf(state.code, sealed, beacon);

        return {
          deck: TableDeckSchema.make(
            dealtDeck(sealed, plan).map((card) => TableCardSchema.make(card))
          ),
          event: RoomEvents.DealtFromBeacon({
            at: command.at,
            hand: sealed.hand,
            round,
            signature,
            spare: openSpare(sealedHandOf(state.code, sealed), plan),
          }),
        };
      }),
  });

export const dealSealed = (
  state: Open,
  command: RoomCommandOf<"DealSealed">
): Decision => {
  if (handInProgress(state)) {
    return Result.fail(
      new DealNotDue({ due: Option.none(), reason: "HandInProgress" })
    );
  }

  const sealed = Option.getOrUndefined(state.sealed);

  if (sealed === undefined) {
    return Result.fail(new NothingSealed({ hand: nextHandNumber(state) }));
  }

  const due = latest(
    betweenHandsDue(state),
    roundAt(state.chain, sealed.round)
  );

  if (command.at < due) {
    return Result.fail(
      new DealNotDue({ due: Option.some(due), reason: "TooEarly" })
    );
  }

  return Result.flatMap(
    dealingEvent(state, sealed, command),
    ({ deck, event }) =>
      andThen(state, Result.succeed([event]), (after) =>
        dealToSealedSeats(after, sealed, deck, command.at)
      )
  );
};

const sealedSeatsReady = (state: Open, sealed: Sealed) =>
  sealed.seats.every((seat) =>
    Option.exists(
      occupantAt(state.table, seat),
      (occupant) => !occupant.sittingOut && occupant.stack > 0
    )
  );

const withdrawalReason = (
  state: Open,
  sealed: Sealed
): Option.Option<WithdrawalReason> => {
  if (state.game === "Waiting" || Attendances.$is("Quiet")(state.attendance)) {
    return Option.some("GamePaused");
  }

  return sealedSeatsReady(state, sealed)
    ? Option.none()
    : Option.some("SeatsChanged");
};

export const withdrawStale = (state: Open, at: Millis): readonly RoomEvent[] =>
  Option.match(state.sealed, {
    onNone: () => [],
    onSome: (sealed) =>
      stillWithdrawable(state, sealed, at)
        ? Option.match(withdrawalReason(state, sealed), {
            onNone: () => [],
            onSome: (reason) => [withdrawal(sealed, reason, at)],
          })
        : [],
  });
