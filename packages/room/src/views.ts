import {
  CardSchema,
  ChipsSchema,
  EventSchema,
  Events,
  LegalActionsSchema,
  PendingDecisions,
  PlayerIdSchema,
  PotShareSchema,
  SeatIndexSchema,
  ShowdownChoicesSchema,
  StreetSchema,
  TableConfigSchema,
  TableStates,
  buildPots,
  pendingDecisions,
} from "@nostakes/engine";
import type { Card, Event, Hand, PlayerId, SeatIndex } from "@nostakes/engine";
import { balances } from "@nostakes/ledger";
import { DeckOpeningSchema } from "@nostakes/shuffle";
import { Data, Option, Schema } from "effect";

import { nextDealAt, timeBankLeft } from "./clocks.js";
import {
  HandNumberSchema,
  OpenedCardSchema,
  RoomEvents,
  roomEventFields,
  sealFields,
} from "./events.js";
import type { Holder, RoomEvent } from "./events.js";
import { AvatarSchema, NameSchema, RoomCodeSchema } from "./identity.js";
import { allEntries } from "./money.js";
import { ChipAmountSchema, RoomSettingsSchema } from "./settings.js";
import { BalanceSchema, SettlementSchema } from "./settlement.js";
import {
  DecisionClocks,
  ProofDeals,
  RoomStates,
  SEATS,
  occupantAt,
  seatOf,
} from "./state.js";
import type { Closed, Open, RoomState, Sealed } from "./state.js";
import { MillisSchema, latest } from "./time.js";
import type { Millis } from "./time.js";

export const AudienceSchema = Schema.TaggedUnion({
  Seated: { player: PlayerIdSchema, seat: SeatIndexSchema },
  Spectator: {},
});

export type Audience = typeof AudienceSchema.Type;

export const Audiences = Data.taggedEnum<Audience>();

export const audienceOf = (state: RoomState, player: PlayerId): Audience =>
  RoomStates.$match(state, {
    Closed: () => Audiences.Spectator(),
    Open: (open) =>
      Option.match(seatOf(open, player), {
        onNone: () => Audiences.Spectator(),
        onSome: (seat) => Audiences.Seated({ player, seat }),
      }),
  });

const { cases } = EventSchema;

export const PublicHandStartedSchema = Schema.TaggedStruct("HandStarted", {
  bigBlindSeat: SeatIndexSchema,
  button: SeatIndexSchema,
  dealtIn: Schema.Array(SeatIndexSchema),
  handNumber: Schema.Int,
  smallBlindSeat: SeatIndexSchema,
});

export const SeenTableEventSchema = Schema.Union([
  cases.AntePosted,
  cases.BlindPosted,
  cases.Called,
  cases.CardsShown,
  cases.Checked,
  cases.ChipsAdded,
  cases.Folded,
  cases.HandEnded,
  cases.HandMucked,
  PublicHandStartedSchema,
  cases.HandTabled,
  cases.HandsTabled,
  cases.HoleCardsDealt,
  cases.PlayerSat,
  cases.PlayerStood,
  cases.PotAwarded,
  cases.RabbitHunted,
  cases.RaisedTo,
  cases.RulesChanged,
  cases.RunsAgreed,
  cases.RunsChosen,
  cases.ShowdownReached,
  cases.ShowdownStarted,
  cases.SittingOutChanged,
  cases.StraddlePosted,
  cases.StreetDealt,
  cases.UncalledBetReturned,
]);

export type SeenTableEvent = typeof SeenTableEventSchema.Type;

export const SeenEventSchema = Schema.TaggedUnion({
  ...roomEventFields,
  HandSealed: sealFields,
  Table: { at: MillisSchema, event: SeenTableEventSchema },
});

export type SeenEvent = typeof SeenEventSchema.Type;

export const SeenEvents = Data.taggedEnum<SeenEvent>();

const holdsSeat = (audience: Audience, seat: SeatIndex) =>
  Audiences.$is("Seated")(audience) && audience.seat === seat;

const seenTableEvent = (event: Event, audience: Audience): SeenTableEvent => {
  if (Events.$is("HandStarted")(event)) {
    return PublicHandStartedSchema.make({
      bigBlindSeat: event.bigBlindSeat,
      button: event.button,
      dealtIn: event.dealtIn,
      handNumber: event.handNumber,
      smallBlindSeat: event.smallBlindSeat,
    });
  }

  if (Events.$is("HoleCardsDealt")(event) && !holdsSeat(audience, event.seat)) {
    return Events.HoleCardsDealt({ cards: [], seat: event.seat });
  }

  return event;
};

const holds = (audience: Audience, holder: Option.Option<Holder>) =>
  Option.match(holder, {
    onNone: () => true,
    onSome: ({ player, seat }) =>
      Audiences.$is("Seated")(audience) &&
      audience.seat === seat &&
      audience.player === player,
  });

export const redact = (event: RoomEvent, audience: Audience): SeenEvent => {
  if (RoomEvents.$is("Table")(event)) {
    return SeenEvents.Table({
      at: event.at,
      event: seenTableEvent(event.event, audience),
    });
  }

  if (RoomEvents.$is("HandSealed")(event)) {
    return SeenEvents.HandSealed({
      at: event.at,
      hand: event.hand,
      roots: event.roots,
      round: event.round,
      seats: event.seats,
    });
  }

  return RoomEvents.$is("CardsOpened")(event) && !holds(audience, event.holder)
    ? SeenEvents.CardsOpened({ ...event, openings: [] })
    : event;
};

const cards = Schema.Array(CardSchema);

const remaining = Schema.Struct({ remainingMs: Schema.Int });

export const AwardSchema = Schema.Struct({
  amount: ChipsSchema,
  eligible: Schema.Array(SeatIndexSchema),
  pot: Schema.Int,
  run: Schema.Int,
  winners: Schema.Array(PotShareSchema),
});

export const SeatViewSchema = Schema.Struct({
  occupant: Schema.Option(
    Schema.Struct({
      away: Schema.Boolean,
      leaving: Schema.Boolean,
      player: PlayerIdSchema,
      sittingOut: Schema.Boolean,
      stack: ChipsSchema,
      straddling: Schema.Boolean,
    })
  ),
  seat: SeatIndexSchema,
});

export const HandViewSchema = Schema.Struct({
  bigBlindSeat: SeatIndexSchema,
  boards: Schema.Array(cards),
  button: SeatIndexSchema,
  choosingRuns: Schema.Option(
    Schema.Struct({
      maxRuns: Schema.Int,
      seats: Schema.Array(SeatIndexSchema),
    })
  ),
  handNumber: Schema.Int,
  players: Schema.Array(
    Schema.Struct({
      committedThisStreet: ChipsSchema,
      committedTotal: ChipsSchema,
      mucked: Schema.Boolean,
      player: PlayerIdSchema,
      seat: SeatIndexSchema,
      shown: cards,
      status: Schema.Literals(["Active", "AllIn", "Folded"]),
    })
  ),
  pots: Schema.Array(
    Schema.Struct({
      amount: ChipsSchema,
      eligible: Schema.Array(SeatIndexSchema),
    })
  ),
  smallBlindSeat: SeatIndexSchema,
  street: StreetSchema,
  toAct: Schema.Option(SeatIndexSchema),
  toShow: Schema.Option(SeatIndexSchema),
});

export const LastHandViewSchema = Schema.Struct({
  awards: Schema.Array(AwardSchema),
  boards: Schema.Array(cards),
  handNumber: Schema.Int,
  mucked: Schema.Array(SeatIndexSchema),
  rabbit: cards,
  shown: Schema.Array(
    Schema.Struct({ cards, player: PlayerIdSchema, seat: SeatIndexSchema })
  ),
  yourCards: cards,
});

export const ClocksViewSchema = Schema.Struct({
  nextDeal: Schema.Option(remaining),
  runChoice: Schema.Option(remaining),
  showdown: Schema.Option(
    Schema.Struct({ remainingMs: Schema.Int, seat: SeatIndexSchema })
  ),
  timeBanks: Schema.Array(
    Schema.Struct({ player: PlayerIdSchema, seconds: Schema.Int })
  ),
  turn: Schema.Option(
    Schema.Struct({
      inTimeBank: Schema.Boolean,
      remainingMs: Schema.Int,
      seat: SeatIndexSchema,
    })
  ),
});

export const SealViewSchema = Schema.Struct({
  hand: HandNumberSchema,
  roots: sealFields.roots,
  round: sealFields.round,
  seats: sealFields.seats,
});

export const DealtViewSchema = Schema.Struct({
  deal: Schema.TaggedUnion({
    FromBeacon: {
      round: sealFields.round,
      signature: Schema.Uint8Array,
      spare: DeckOpeningSchema,
    },
    WithoutBeacon: { reason: Schema.Literal("BeaconUnavailable") },
  }),
  openings: Schema.Array(OpenedCardSchema),
  seal: SealViewSchema,
});

export const FairnessViewSchema = Schema.Struct({
  dealt: Schema.Option(DealtViewSchema),
  sealed: Schema.Option(SealViewSchema),
});

const MemberViewSchema = Schema.Struct({
  avatar: AvatarSchema,
  name: NameSchema,
  player: PlayerIdSchema,
});

export const RoomViewSchema = Schema.TaggedUnion({
  Closed: {
    code: RoomCodeSchema,
    members: Schema.Array(MemberViewSchema),
    settlement: SettlementSchema,
  },
  Open: {
    balances: Schema.Array(BalanceSchema),
    clocks: ClocksViewSchema,
    code: RoomCodeSchema,
    fairness: FairnessViewSchema,
    game: Schema.Literals(["Running", "Waiting"]),
    hand: Schema.Option(HandViewSchema),
    holeCards: cards,
    host: PlayerIdSchema,
    lastHand: Schema.Option(LastHandViewSchema),
    legal: Schema.Option(LegalActionsSchema),
    members: Schema.Array(MemberViewSchema),
    queued: Schema.Struct({
      chips: Schema.Array(
        Schema.Struct({ amount: ChipAmountSchema, player: PlayerIdSchema })
      ),
      close: Schema.Boolean,
      leaving: Schema.Array(PlayerIdSchema),
      rules: Schema.Option(TableConfigSchema),
    }),
    requests: Schema.Struct({
      chips: Schema.Array(
        Schema.Struct({ amount: ChipAmountSchema, player: PlayerIdSchema })
      ),
      seats: Schema.Array(
        Schema.Struct({
          buyIn: ChipAmountSchema,
          player: PlayerIdSchema,
          seat: SeatIndexSchema,
        })
      ),
    }),
    seats: Schema.Array(SeatViewSchema),
    settings: RoomSettingsSchema,
    showdown: Schema.Option(ShowdownChoicesSchema),
    you: Schema.Option(PlayerIdSchema),
  },
});

export type RoomView = typeof RoomViewSchema.Type;

type FairnessDeal = typeof DealtViewSchema.Type.deal;

const FairnessDeals = Data.taggedEnum<FairnessDeal>();

export const RoomViews = Data.taggedEnum<RoomView>();

type HandView = typeof HandViewSchema.Type;

type LastHandView = typeof LastHandViewSchema.Type;

const viewerSeat = (state: Open, audience: Audience) =>
  Audiences.$is("Seated")(audience) &&
  Option.exists(
    occupantAt(state.table, audience.seat),
    (occupant) => occupant.player === audience.player
  )
    ? Option.some(audience)
    : Option.none();

const seatsView = (state: Open) =>
  SEATS.map((seat) => ({
    occupant: occupantAt(state.table, seat).pipe(
      Option.map((occupant) => ({
        away: state.away.includes(seat),
        leaving: state.queued.leaving.includes(occupant.player),
        player: occupant.player,
        sittingOut: occupant.sittingOut,
        stack: occupant.stack,
        straddling: state.straddlers.includes(occupant.player),
      }))
    ),
    seat,
  }));

const potsInTheMiddle = (hand: Hand) => {
  const collected = buildPots({
    ...hand,
    players: hand.players.map((player) => ({
      ...player,
      committedTotal: ChipsSchema.make(
        player.committedTotal - player.committedThisStreet
      ),
    })),
  }).map((pot) => ({ amount: pot.amount, eligible: pot.eligible }));

  const contenders = hand.players
    .filter((player) => player.status !== "Folded")
    .map((player) => player.seat);

  return collected.length === 0 && hand.deadMoney > 0
    ? [{ amount: hand.deadMoney, eligible: contenders }]
    : collected;
};

const handView = (state: Open): Option.Option<HandView> => {
  const { table } = state;

  if (!TableStates.$is("InHand")(table)) {
    return Option.none();
  }

  const { hand } = table;
  const pending = pendingDecisions(table);

  return Option.some({
    bigBlindSeat: hand.bigBlindSeat,
    boards: Option.match(state.record, {
      onNone: () => [hand.board],
      onSome: (record) => record.boards,
    }),
    button: table.button,
    choosingRuns: PendingDecisions.$is("ChooseRuns")(pending)
      ? Option.some({ maxRuns: pending.maxRuns, seats: pending.seats })
      : Option.none(),
    handNumber: table.handNumber,
    players: hand.players.map((player) => ({
      committedThisStreet: player.committedThisStreet,
      committedTotal: player.committedTotal,
      mucked: player.mucked,
      player: player.player,
      seat: player.seat,
      shown: player.publicCards,
      status: player.status,
    })),
    pots: potsInTheMiddle(hand),
    smallBlindSeat: hand.smallBlindSeat,
    street: hand.street,
    toAct: PendingDecisions.$is("Bet")(pending)
      ? Option.some(pending.legal.seat)
      : Option.none(),
    toShow: PendingDecisions.$is("Show")(pending)
      ? Option.some(pending.choices.seat)
      : Option.none(),
  });
};

interface Dealt {
  readonly holeCards: readonly Card[];
  readonly player: PlayerId;
  readonly seat: SeatIndex;
}

const ownCards = (
  players: readonly Dealt[],
  viewer: Option.Option<Audience>
): readonly Card[] =>
  Option.match(viewer.pipe(Option.filter(Audiences.$is("Seated"))), {
    onNone: () => [],
    onSome: ({ player, seat }) =>
      players.find((dealt) => dealt.seat === seat && dealt.player === player)
        ?.holeCards ?? [],
  });

const lastHandView = (
  state: Open,
  audience: Audience
): Option.Option<LastHandView> => {
  const { table } = state;

  if (TableStates.$is("InHand")(table)) {
    return Option.none();
  }

  return table.lastHand.pipe(
    Option.flatMap((lastHand) =>
      state.record.pipe(
        Option.map((record) => ({
          awards: record.awards,
          boards: record.boards,
          handNumber: record.handNumber,
          mucked: record.mucked,
          rabbit: record.rabbit,
          shown: lastHand.players
            .filter((player) => player.publicCards.length > 0)
            .map((player) => ({
              cards: player.publicCards,
              player: player.player,
              seat: player.seat,
            })),
          yourCards: ownCards(lastHand.players, viewerSeat(state, audience)),
        }))
      )
    )
  );
};

const remainingAt = (deadline: Millis, at: Millis) => ({
  remainingMs: Math.max(0, deadline - at),
});

const clocksView = (state: Open, at: Millis) => ({
  nextDeal: Option.map(nextDealAt(state), (due) => remainingAt(due, at)),
  runChoice: state.clocks.decision.pipe(
    Option.filter(DecisionClocks.$is("RunChoice")),
    Option.map(({ deadline }) => remainingAt(deadline, at))
  ),
  showdown: state.clocks.decision.pipe(
    Option.filter(DecisionClocks.$is("Showdown")),
    Option.map(({ deadline, seat }) => ({
      ...remainingAt(deadline, at),
      seat,
    }))
  ),
  timeBanks: SEATS.flatMap((seat) =>
    Option.match(occupantAt(state.table, seat), {
      onNone: () => [],
      onSome: ({ player }) => [
        { player, seconds: timeBankLeft(state, player) },
      ],
    })
  ),
  turn: state.clocks.decision.pipe(
    Option.filter(DecisionClocks.$is("Turn")),
    Option.map(({ bankFrom, deadline, seat }) => ({
      inTimeBank: Option.isSome(bankFrom),
      ...remainingAt(deadline, at),
      seat,
    }))
  ),
});

const sealView = (sealed: Sealed) => ({
  hand: sealed.hand,
  roots: sealed.roots,
  round: sealed.round,
  seats: sealed.seats,
});

const fairnessView = (state: Open, audience: Audience) => {
  const viewer = viewerSeat(state, audience);

  return {
    dealt: state.proof.pipe(
      Option.map((proof) => ({
        deal: ProofDeals.$match(proof.deal, {
          FromBeacon: ({ round, signature, spare }) =>
            FairnessDeals.FromBeacon({ round, signature, spare }),
          WithoutBeacon: ({ reason }) =>
            FairnessDeals.WithoutBeacon({ reason }),
        }),
        openings: proof.opened.flatMap((opened) =>
          Option.match(opened.holder, {
            onNone: () => [opened.card],
            onSome: (holder) =>
              Option.exists(
                viewer,
                (seated) =>
                  Audiences.$is("Seated")(seated) &&
                  seated.seat === holder.seat &&
                  seated.player === holder.player
              )
                ? [opened.card]
                : [],
          })
        ),
        seal: sealView(proof.sealed),
      }))
    ),
    sealed: state.sealed.pipe(Option.map(sealView)),
  };
};

const membersView = (state: Open | Closed) =>
  state.members.map(({ avatar, name, player }) => ({ avatar, name, player }));

const legalFor = (state: Open, viewer: Option.Option<Audience>) => {
  const pending = pendingDecisions(state.table);

  return PendingDecisions.$is("Bet")(pending) &&
    Option.exists(
      viewer.pipe(Option.filter(Audiences.$is("Seated"))),
      ({ seat }) => seat === pending.legal.seat
    )
    ? Option.some(pending.legal)
    : Option.none();
};

const showdownFor = (state: Open, viewer: Option.Option<Audience>) => {
  const pending = pendingDecisions(state.table);

  return PendingDecisions.$is("Show")(pending) &&
    Option.exists(
      viewer.pipe(Option.filter(Audiences.$is("Seated"))),
      ({ seat }) => seat === pending.choices.seat
    )
    ? Option.some(pending.choices)
    : Option.none();
};

const openView = (state: Open, audience: Audience, at: Millis): RoomView => {
  const viewer = viewerSeat(state, audience);
  const { table } = state;

  return RoomViews.Open({
    balances: balances(allEntries(state.entries)),
    clocks: clocksView(state, latest(at, state.now)),
    code: state.code,
    fairness: fairnessView(state, audience),
    game: state.game,
    hand: handView(state),
    holeCards: TableStates.$is("InHand")(table)
      ? ownCards(table.hand.players, viewer)
      : [],
    host: state.host,
    lastHand: lastHandView(state, audience),
    legal: legalFor(state, viewer),
    members: membersView(state),
    queued: state.queued,
    requests: state.requests,
    seats: seatsView(state),
    settings: state.settings,
    showdown: showdownFor(state, viewer),
    you: viewer.pipe(
      Option.filter(Audiences.$is("Seated")),
      Option.map(({ player }) => player)
    ),
  });
};

export const viewFor = (
  state: RoomState,
  audience: Audience,
  at: Millis
): RoomView =>
  RoomStates.$match(state, {
    Closed: (closed) =>
      RoomViews.Closed({
        code: closed.code,
        members: membersView(closed),
        settlement: closed.settlement,
      }),
    Open: (open) => openView(open, audience, at),
  });
