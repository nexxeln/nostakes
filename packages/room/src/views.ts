import {
  CardSchema,
  ChipsSchema,
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
  isBombPot,
  pendingDecisions,
} from "@nostakes/engine";
import type { Card, Hand, PlayerId, SeatIndex } from "@nostakes/engine";
import { NetSchema, balances } from "@nostakes/ledger";
import { DeckOpeningSchema } from "@nostakes/shuffle";
import { Data, Effect, Option, Schema } from "effect";

import { nextDealAt, timeBankLeft } from "./clocks.js";
import { ClosingSchema, closingOf } from "./closing.js";
import { bombCalledFor, nextIsBombPot } from "./dealing.js";
import { HandNumberSchema, OpenedCardSchema, sealFields } from "./events.js";
import { AvatarSchema, NameSchema, RoomCodeSchema } from "./identity.js";
import { hostClaimableAt } from "./members.js";
import { allEntries } from "./money.js";
import { recapField } from "./recap.js";
import { Audiences } from "./redaction.js";
import type { Audience } from "./redaction.js";
import { ChipAmountSchema, RoomSettingsSchema } from "./settings.js";
import {
  BalanceSchema,
  SettlementSchema,
  TransferSchema,
} from "./settlement.js";
import {
  DecisionClocks,
  ProofDeals,
  RoomStates,
  SEATS,
  isMember,
  isOpen,
  isRemoved,
  knockOf,
  namedPeople,
  occupantAt,
  removedInTheSettlement,
  seatOf,
  waitingKnocks,
} from "./state.js";
import type {
  Closed,
  Knock,
  Member,
  Open,
  RoomState,
  Sealed,
} from "./state.js";
import { MillisSchema, latest, millis } from "./time.js";
import type { Millis } from "./time.js";

export {
  AudienceSchema,
  Audiences,
  PublicHandStartedSchema,
  SeenEventSchema,
  SeenEvents,
  SeenTableEventSchema,
  redact,
} from "./redaction.js";

export type { Audience, SeenEvent, SeenTableEvent } from "./redaction.js";

export const audienceOf = (state: RoomState, player: PlayerId): Audience =>
  RoomStates.$match(state, {
    Closed: () => Audiences.Unseated({ player }),
    Open: (open) =>
      Option.match(seatOf(open, player), {
        onNone: () => Audiences.Unseated({ player }),
        onSome: (seat) => Audiences.Seated({ player, seat }),
      }),
  });

const cards = Schema.Array(CardSchema);

const absentAs = <S extends Schema.Top & Schema.WithoutConstructorDefault>(
  schema: S,
  fallback: S["Type"]
) => schema.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(fallback)));

const serverTime = absentAs(MillisSchema, millis(0));

const remaining = Schema.Struct({
  deadline: serverTime,
  remainingMs: Schema.Int,
});

const decision = Schema.Struct({
  ...remaining.fields,
  totalMs: absentAs(Schema.Int, 0),
});

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
      leavingRoom: absentAs(Schema.Boolean, false),
      owes: Schema.Struct({
        big: Schema.Boolean,
        entry: Schema.Boolean,
        small: Schema.Boolean,
      }),
      player: PlayerIdSchema,
      posts: Schema.Boolean,
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
  bombPot: absentAs(Schema.Boolean, false),
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

export const BountyViewSchema = Schema.Struct({
  payers: Schema.Array(PotShareSchema),
  seat: SeatIndexSchema,
});

export const LastHandViewSchema = Schema.Struct({
  awards: Schema.Array(AwardSchema),
  boards: Schema.Array(cards),
  bounty: absentAs(Schema.Option(BountyViewSchema), Option.none()),
  dealtIn: absentAs(
    Schema.Array(
      Schema.Struct({
        folded: Schema.Boolean,
        player: PlayerIdSchema,
        seat: SeatIndexSchema,
      })
    ),
    []
  ),
  handNumber: Schema.Int,
  mucked: Schema.Array(SeatIndexSchema),
  rabbit: cards,
  shown: Schema.Array(
    Schema.Struct({ cards, player: PlayerIdSchema, seat: SeatIndexSchema })
  ),
  yourCards: cards,
});

export const ClocksViewSchema = Schema.Struct({
  at: serverTime,
  nextDeal: Schema.Option(remaining),
  runChoice: Schema.Option(decision),
  showdown: Schema.Option(
    Schema.Struct({ ...decision.fields, seat: SeatIndexSchema })
  ),
  timeBanks: Schema.Array(
    Schema.Struct({ player: PlayerIdSchema, seconds: Schema.Int })
  ),
  turn: Schema.Option(
    Schema.Struct({
      ...decision.fields,
      inTimeBank: Schema.Boolean,
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
    WithoutBeacon: {
      at: absentAs(Schema.Option(MillisSchema), Option.none()),
      reason: Schema.Literal("BeaconUnavailable"),
    },
  }),
  openings: Schema.Array(OpenedCardSchema),
  seal: SealViewSchema,
});

export const SealedDealsViewSchema = Schema.Struct({
  fromBeacon: Schema.Int,
  withoutBeacon: Schema.Int,
});

export const FairnessViewSchema = Schema.Struct({
  dealt: Schema.Option(DealtViewSchema),
  sealed: Schema.Option(SealViewSchema),
  tonight: absentAs(SealedDealsViewSchema, { fromBeacon: 0, withoutBeacon: 0 }),
});

const MemberViewSchema = Schema.Struct({
  avatar: AvatarSchema,
  name: NameSchema,
  player: PlayerIdSchema,
});

const youField = absentAs(Schema.Option(PlayerIdSchema), Option.none());

export const KnockerViewSchema = Schema.Struct({
  ...MemberViewSchema.fields,
  lapsesAt: MillisSchema,
  since: MillisSchema,
});

const knockingField = absentAs(Schema.Array(KnockerViewSchema), []);

export const AttendanceViewSchema = Schema.TaggedUnion({
  Attended: { since: MillisSchema },
  Quiet: { pausedAt: MillisSchema, since: MillisSchema },
  Unattended: { since: MillisSchema },
});

const attendanceField = absentAs(
  AttendanceViewSchema,
  AttendanceViewSchema.cases.Attended.make({ since: millis(0) })
);

const departedField = absentAs(Schema.Array(MemberViewSchema), []);

const removedField = absentAs(Schema.Array(MemberViewSchema), []);

export const StallViewSchema = Schema.Struct({ since: MillisSchema });

export const HostAwayViewSchema = Schema.Struct({
  claimableAt: MillisSchema,
  since: MillisSchema,
});

const hostAwayField = absentAs(
  Schema.Option(HostAwayViewSchema),
  Option.none()
);

const stalledField = absentAs(Schema.Option(StallViewSchema), Option.none());

export const BombPotViewSchema = Schema.Struct({
  called: Schema.Boolean,
  next: Schema.Boolean,
});

export const RoomViewSchema = Schema.TaggedUnion({
  Closed: {
    code: RoomCodeSchema,
    departed: departedField,
    members: Schema.Array(MemberViewSchema),
    recap: recapField,
    removed: removedField,
    settlement: SettlementSchema,
    you: youField,
  },
  Open: {
    attendance: attendanceField,
    balances: Schema.Array(BalanceSchema),
    bombPot: absentAs(BombPotViewSchema, { called: false, next: false }),
    clocks: ClocksViewSchema,
    closing: absentAs(ClosingSchema, "Now"),
    code: RoomCodeSchema,
    departed: departedField,
    fairness: FairnessViewSchema,
    game: Schema.Literals(["Running", "Waiting"]),
    hand: Schema.Option(HandViewSchema),
    holeCards: cards,
    host: PlayerIdSchema,
    hostAway: hostAwayField,
    knocking: knockingField,
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
    removed: removedField,
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
    stalled: stalledField,
    you: youField,
  },
});

export type RoomView = typeof RoomViewSchema.Type;

export const KnockAnswerSchema = Schema.Literals([
  "Waiting",
  "TurnedAway",
  "Lapsed",
  "Locked",
  "NameTaken",
  "NightOver",
]);

export type KnockAnswer = typeof KnockAnswerSchema.Type;

export const KnockViewSchema = Schema.Struct({
  answer: KnockAnswerSchema,
  avatar: AvatarSchema,
  code: RoomCodeSchema,
  name: NameSchema,
});

export type KnockView = typeof KnockViewSchema.Type;

export const RemovedViewSchema = Schema.Struct({
  balance: BalanceSchema,
  code: RoomCodeSchema,
  finishing: Schema.Boolean,
  people: Schema.Array(MemberViewSchema),
  player: PlayerIdSchema,
  transfers: Schema.Option(Schema.Array(TransferSchema)),
});

export type RemovedView = typeof RemovedViewSchema.Type;

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
        leavingRoom: !isMember(state, occupant.player),
        owes: occupant.owes,
        player: occupant.player,
        posts: state.posters.includes(occupant.player),
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
    bombPot: isBombPot(hand),
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
          bounty: record.bounty,
          dealtIn: lastHand.players.map(({ folded, player, seat }) => ({
            folded,
            player,
            seat,
          })),
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
  deadline,
  remainingMs: Math.max(0, deadline - at),
});

const decisionAt = (startedAt: Millis, deadline: Millis, at: Millis) => ({
  ...remainingAt(deadline, at),
  totalMs: Math.max(0, deadline - startedAt),
});

const clocksView = (state: Open, at: Millis) => ({
  at,
  nextDeal: Option.map(nextDealAt(state), (due) => remainingAt(due, at)),
  runChoice: state.clocks.decision.pipe(
    Option.filter(DecisionClocks.$is("RunChoice")),
    Option.map(({ deadline, startedAt }) => decisionAt(startedAt, deadline, at))
  ),
  showdown: state.clocks.decision.pipe(
    Option.filter(DecisionClocks.$is("Showdown")),
    Option.map(({ deadline, seat, startedAt }) => ({
      ...decisionAt(startedAt, deadline, at),
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
    Option.map(({ bankFrom, deadline, seat, startedAt }) => ({
      inTimeBank: Option.isSome(bankFrom),
      ...decisionAt(
        Option.getOrElse(bankFrom, () => startedAt),
        deadline,
        at
      ),
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
      Option.filter(() => !TableStates.$is("InHand")(state.table)),
      Option.map((proof) => ({
        deal: ProofDeals.$match(proof.deal, {
          FromBeacon: ({ round, signature, spare }) =>
            FairnessDeals.FromBeacon({ round, signature, spare }),
          WithoutBeacon: ({ at, reason }) =>
            FairnessDeals.WithoutBeacon({ at: Option.some(at), reason }),
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
    tonight: state.sealedDeals,
  };
};

const profilesOf = (members: readonly Member[]) =>
  members.map(({ avatar, name, player }) => ({ avatar, name, player }));

const membersView = (state: Open | Closed) => profilesOf(state.members);

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

const hosting = (state: Open, audience: Audience) =>
  Audiences.$match(audience, {
    Seated: ({ player }) => player === state.host,
    Spectator: () => false,
    Unseated: ({ player }) => player === state.host,
  });

const knockingView = (state: Open, audience: Audience) =>
  hosting(state, audience)
    ? waitingKnocks(state).map(({ avatar, lapsesAt, name, player, since }) => ({
        avatar,
        lapsesAt,
        name,
        player,
        since,
      }))
    : [];

const openView = (state: Open, audience: Audience, at: Millis): RoomView => {
  const viewer = viewerSeat(state, audience);
  const { table } = state;

  return RoomViews.Open({
    attendance: state.attendance,
    balances: balances(allEntries(state.entries)),
    bombPot: { called: bombCalledFor(state), next: nextIsBombPot(state) },
    clocks: clocksView(state, latest(at, state.now)),
    closing: closingOf(state, state.now),
    code: state.code,
    departed: profilesOf(state.departed),
    fairness: fairnessView(state, audience),
    game: state.game,
    hand: handView(state),
    holeCards: TableStates.$is("InHand")(table)
      ? ownCards(table.hand.players, viewer)
      : [],
    host: state.host,
    hostAway: Option.all({
      claimableAt: hostClaimableAt(state),
      since: state.hostAway,
    }),
    knocking: knockingView(state, audience),
    lastHand: lastHandView(state, audience),
    legal: legalFor(state, viewer),
    members: membersView(state),
    queued: state.queued,
    removed: profilesOf(removedInTheSettlement(state)),
    requests: state.requests,
    seats: seatsView(state),
    settings: state.settings,
    showdown: showdownFor(state, viewer),
    stalled: state.stalled.pipe(Option.map(({ since }) => ({ since }))),
    you: Audiences.$match(audience, {
      Seated: ({ player }) => viewer.pipe(Option.map(() => player)),
      Spectator: () => Option.none(),
      Unseated: ({ player }) => Option.some(player),
    }),
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
        departed: profilesOf(closed.departed),
        members: membersView(closed),
        recap: closed.recap,
        removed: profilesOf(removedInTheSettlement(closed)),
        settlement: closed.settlement,
        you: Audiences.$match(audience, {
          Seated: ({ player }) => Option.some(player),
          Spectator: () => Option.none(),
          Unseated: ({ player }) => Option.some(player),
        }),
      }),
    Open: (open) => openView(open, audience, at),
  });

const answerOf = (state: RoomState, knock: Knock): Option.Option<KnockAnswer> =>
  Option.match(knock.outcome, {
    onNone: () => Option.some(isOpen(state) ? "Waiting" : "NightOver"),
    onSome: (outcome) =>
      outcome === "LetIn" ? Option.none() : Option.some(outcome),
  });

export const knockView = (
  state: RoomState,
  player: PlayerId
): Option.Option<KnockView> =>
  knockOf(state, player).pipe(
    Option.flatMap((knock) =>
      Option.map(answerOf(state, knock), (answer) => ({
        answer,
        avatar: knock.avatar,
        code: state.code,
        name: knock.name,
      }))
    )
  );

export const holdsPlace = (state: RoomState, player: PlayerId) =>
  !isRemoved(state, player) &&
  Option.match(knockView(state, player), {
    onNone: () => true,
    onSome: ({ answer }) => answer === "Waiting",
  });

const nothingYet = (player: PlayerId) => ({
  boughtIn: 0,
  cashedOut: 0,
  net: NetSchema.make(0),
  player,
});

const profileOf = (state: Open | Closed, player: PlayerId) =>
  [...state.removed, ...namedPeople(state)].find(
    (person) => person.player === player
  );

export const removedView = (
  state: RoomState,
  player: PlayerId
): RemovedView => {
  const done = RoomStates.$match(state, {
    Closed: (closed) => ({
      balance: closed.settlement.balances.find(
        (balance) => balance.player === player
      ),
      finishing: false,
      transfers: Option.some(
        closed.settlement.transfers.filter(
          ({ from, to }) => from === player || to === player
        )
      ),
    }),
    Open: (open) => ({
      balance: balances(allEntries(open.entries)).find(
        (balance) => balance.player === player
      ),
      finishing: Option.isSome(seatOf(open, player)),
      transfers: Option.none(),
    }),
  });

  const counterparts = Option.getOrElse(done.transfers, () => []).flatMap(
    ({ from, to }) => [from, to]
  );

  const shown = [player, ...counterparts].filter(
    (person, index, all) => all.indexOf(person) === index
  );

  return {
    balance: done.balance ?? nothingYet(player),
    code: state.code,
    finishing: done.finishing,
    people: profilesOf(
      shown.flatMap((person) => {
        const profile = profileOf(state, person);

        return profile === undefined ? [] : [profile];
      })
    ),
    player,
    transfers: done.transfers,
  };
};

export const clearableOf = (
  view: Extract<RoomView, { readonly _tag: "Open" }>
): readonly PlayerId[] => {
  const seated = new Set(
    view.seats.flatMap(({ occupant }) =>
      Option.toArray(occupant).map(({ player }) => player)
    )
  );

  const counted = new Set(view.balances.map(({ player }) => player));

  return [
    ...view.members
      .filter(({ player }) => player !== view.host && !seated.has(player))
      .map(({ player }) => player),
    ...view.departed
      .filter(({ player }) => !counted.has(player))
      .map(({ player }) => player),
  ];
};
