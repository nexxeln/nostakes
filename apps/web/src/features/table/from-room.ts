import { cardText, handCategory } from "@nostakes/engine";
import type { Card, HandCategory, HandRank } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/protocol";
import { RoomViews, SeenEvents } from "@nostakes/room";
import type { RoomView, SeenEvent, SeenTableEvent } from "@nostakes/room";
import { Match, Option } from "effect";

import type { InRoom } from "../model.js";
import { entryOf, entryWords, waitingNote } from "../posting.js";
import { isActing, isLive, isYou, peopleOf } from "../room.js";
import type { OpenView } from "../room.js";
import { isPeeking } from "../signals.js";
import { HappeningSchema, Happenings } from "./snapshot.js";
import type {
  ActionClock,
  AfterHand,
  Happening,
  HeroLegal,
  Hint,
  PostKind,
  Posted,
  SeatPost,
  SeatSnapshot,
  SeatStatus,
  TableEvent,
  TableSnapshot,
} from "./snapshot.js";

const HAPPENINGS_PER_EVENT = 16;

export const KEPT_EVENTS = 64;

const CATEGORY_LABELS: Record<HandCategory, string> = {
  Flush: "Flush",
  FourOfAKind: "Four of a kind",
  FullHouse: "Full house",
  HighCard: "High card",
  OnePair: "Pair",
  RoyalFlush: "Royal flush",
  Straight: "Straight",
  StraightFlush: "Straight flush",
  ThreeOfAKind: "Three of a kind",
  TwoPair: "Two pair",
};

const rankLabel = (rank: HandRank) => CATEGORY_LABELS[handCategory(rank)];

const texts = (cards: readonly Card[]) => cards.map(cardText);

const runWord = (runs: number) => {
  if (runs === 1) {
    return "Once";
  }

  return runs === 2 ? "Twice" : `${runs} times`;
};

const blindKind = (blind: "Small" | "Big", dead: boolean): PostKind => {
  if (dead) {
    return "DeadSmallBlind";
  }

  return blind === "Small" ? "SmallBlind" : "BigBlind";
};

const tableHappenings = (
  event: SeenTableEvent,
  facing: number
): readonly Happening[] =>
  Match.value(event).pipe(
    Match.tagsExhaustive({
      AntePosted: ({ amount, seat }) => [
        Happenings.Post.make({ amount, kind: "Ante", seat }),
      ],
      BlindPosted: ({ amount, blind, dead, seat }) => [
        Happenings.Post.make({
          amount,
          kind: blindKind(blind, dead === true),
          seat,
        }),
      ],
      Called: ({ allIn, amount, seat }) => [
        Happenings.Call.make({ added: amount, allIn, seat }),
      ],
      CardsShown: ({ cards, seat }) => [
        Happenings.Show.make({ cards: texts(cards), label: "Shows", seat }),
      ],
      Checked: ({ seat }) => [Happenings.Check.make({ seat })],
      ChipsAdded: ({ amount, seat }) => [
        Happenings.Say.make({ seat, text: `+${amount} chips` }),
      ],
      Folded: ({ seat }) => [Happenings.Fold.make({ seat })],
      HandEnded: () => [],
      HandMucked: ({ seat }) => [Happenings.Muck.make({ seat })],
      HandStarted: ({ handNumber }) => [
        Happenings.Start.make({ hand: handNumber }),
      ],
      HandTabled: ({ cards, rank, seat }) => [
        Happenings.Show.make({
          cards: texts(cards),
          label: rankLabel(rank),
          seat,
        }),
      ],
      HandsTabled: ({ hands }) =>
        hands.map(({ cards, seat }) =>
          Happenings.Show.make({ cards: texts(cards), label: "", seat })
        ),
      HoleCardsDealt: ({ seat }) => [Happenings.Deal.make({ cards: 2, seat })],
      PlayerSat: () => [],
      PlayerStood: () => [],
      PotAwarded: ({ winners }) =>
        winners.map(({ amount, seat }) =>
          Happenings.Win.make({ amount, seat })
        ),
      RabbitHunted: () => [],
      RaisedTo: ({ added, allIn, seat, to }) => [
        Happenings.Bet.make({ added, allIn, raise: facing > 0, seat, to }),
      ],
      RulesChanged: () => [],
      RunsAgreed: () => [],
      RunsChosen: ({ runs, seat }) => [
        Happenings.Say.make({ seat, text: `Run it ${runWord(runs)}` }),
      ],
      ShowdownReached: ({ order }) =>
        order.map((entry) =>
          Match.value(entry).pipe(
            Match.tagsExhaustive({
              Mucked: ({ seat }) => Happenings.Muck.make({ seat }),
              Shown: ({ cards, rank, seat }) =>
                Happenings.Show.make({
                  cards: texts(cards),
                  label: rankLabel(rank),
                  seat,
                }),
            })
          )
        ),
      ShowdownStarted: () => [],
      SittingOutChanged: () => [],
      StraddlePosted: ({ amount, seat }) => [
        Happenings.Post.make({ amount, kind: "Straddle", seat }),
      ],
      StreetDealt: ({ street }) => [Happenings.Collect.make({ street })],
      UncalledBetReturned: ({ amount, seat }) => [
        Happenings.Return.make({ amount, seat }),
      ],
    })
  );

export const happeningsOf = (
  seq: number,
  event: SeenEvent,
  facing: number
): readonly TableEvent[] =>
  SeenEvents.$is("Table")(event)
    ? tableHappenings(event.event, facing).map((happening, index) => ({
        happening,
        id: seq * HAPPENINGS_PER_EVENT + index,
      }))
    : [];

type HandOf = Option.Option.Value<OpenView["hand"]>;

export const betToFace = (hand: HandOf) =>
  Math.max(
    0,
    ...hand.players.map(({ committedThisStreet }) => committedThisStreet)
  );

export const betFacedIn = (view: Option.Option<RoomView>) =>
  Option.match(view, {
    onNone: () => 0,
    onSome: (seen) =>
      RoomViews.$match(seen, {
        Closed: () => 0,
        Open: ({ hand }) =>
          Option.match(hand, { onNone: () => 0, onSome: betToFace }),
      }),
  });

const betAfter = (facing: number, event: SeenEvent): number => {
  if (!SeenEvents.$is("Table")(event)) {
    return facing;
  }

  return Match.value(event.event).pipe(
    Match.tags({
      BlindPosted: ({ amount, dead }) =>
        dead === true ? facing : Math.max(facing, amount),
      HandStarted: () => 0,
      RaisedTo: ({ to }) => Math.max(facing, to),
      StraddlePosted: ({ amount }) => Math.max(facing, amount),
      StreetDealt: () => 0,
    }),
    Match.orElse(() => facing)
  );
};

export const facingEach = <Entry extends { readonly event: SeenEvent }>(
  facingFirst: number,
  applied: readonly Entry[]
): readonly (Entry & { readonly facing: number })[] => {
  const faced: (Entry & { readonly facing: number })[] = [];
  let facing = facingFirst;

  for (const entry of applied) {
    faced.push({ ...entry, facing });
    facing = betAfter(facing, entry.event);
  }

  return faced;
};

export const happeningsFrom = (
  facingFirst: number,
  applied: readonly { readonly event: SeenEvent; readonly seq: number }[]
): readonly TableEvent[] => {
  const happenings: TableEvent[] = [];

  for (const { event, facing, seq } of facingEach(facingFirst, applied)) {
    happenings.push(...happeningsOf(seq, event, facing));
  }

  return happenings;
};

const lastHandOf = (view: OpenView, player: PlayerId, seat: number) =>
  view.lastHand.pipe(
    Option.flatMap(({ dealtIn }) =>
      Option.fromNullishOr(
        dealtIn.find((entry) => entry.player === player && entry.seat === seat)
      )
    )
  );

const PLAYER_STATUS = {
  Active: "In",
  AllIn: "AllIn",
  Folded: "Folded",
} as const satisfies Record<string, SeatStatus>;

type Occupant = NonNullable<
  Option.Option.Value<OpenView["seats"][number]["occupant"]>
>;

interface SeatContext {
  readonly view: OpenView;
  readonly room: InRoom;
  readonly presence: readonly PlayerId[];
}

const noteOf = (occupant: Occupant, here: boolean) => {
  if (occupant.leavingRoom) {
    return "Leaving";
  }

  if (occupant.leaving) {
    return "Standing up";
  }

  if (occupant.sittingOut) {
    return "Sitting out";
  }

  return occupant.away || !here ? "Away" : "";
};

const statusBetweenHands = (
  view: OpenView,
  occupant: Occupant,
  seat: number
): SeatStatus => {
  if (occupant.sittingOut) {
    return "Out";
  }

  return Option.exists(
    lastHandOf(view, occupant.player, seat),
    ({ folded }) => folded
  )
    ? "Folded"
    : "In";
};

const heldCards = (held: {
  readonly between: boolean;
  readonly mine: boolean;
  readonly status: SeatStatus;
  readonly heroCards: number;
  readonly ownCards: number;
}) => {
  if (held.mine && held.between) {
    return held.heroCards;
  }

  return held.status === "Folded" || held.status === "Out" ? 0 : held.ownCards;
};

const occupiedSeat = (
  context: SeatContext,
  seat: number,
  occupant: Occupant
): SeatSnapshot => {
  const { presence, view } = context;
  const mine = isYou(view, occupant.player);
  const here = presence.includes(occupant.player);

  const member = peopleOf(view).find(
    ({ player }) => player === occupant.player
  );

  const inHand = view.hand.pipe(
    Option.flatMap((hand) =>
      Option.fromNullishOr(hand.players.find((player) => player.seat === seat))
    )
  );

  const lastShown = view.lastHand.pipe(
    Option.flatMap((last) =>
      Option.fromNullishOr(last.shown.find((entry) => entry.seat === seat))
    ),
    Option.map(({ cards }) => texts(cards)),
    Option.getOrElse((): readonly string[] => [])
  );

  const status: SeatStatus = Option.match(inHand, {
    onNone: () =>
      Option.isSome(view.hand)
        ? "Out"
        : statusBetweenHands(view, occupant, seat),
    onSome: (player) => PLAYER_STATUS[player.status],
  });

  const heroCards = Option.isSome(view.hand)
    ? view.holeCards.length
    : Option.match(view.lastHand, {
        onNone: () => 0,
        onSome: ({ yourCards }) => yourCards.length,
      });

  const othersCards = Option.match(inHand, {
    onNone: () => 0,
    onSome: (player) => (player.mucked || player.shown.length > 0 ? 0 : 2),
  });

  const ownCards = mine ? heroCards : othersCards;

  const cardsHeld = heldCards({
    between: Option.isNone(view.hand),
    heroCards,
    mine,
    ownCards,
    status,
  });

  return {
    avatar: member?.avatar ?? "",
    away: occupant.away || !here,
    bet: Option.match(inHand, {
      onNone: () => 0,
      onSome: ({ committedThisStreet }) => committedThisStreet,
    }),
    cardsHeld,
    name: mine ? "You" : (member?.name ?? "Someone"),
    note: noteOf(occupant, here) || waitingNote(view, seat, occupant),
    peeking:
      view.settings.peeking &&
      (status === "In" || status === "AllIn") &&
      cardsHeld > 0 &&
      isPeeking(context.room, occupant.player),
    seat,
    shown: Option.match(inHand, {
      onNone: () => lastShown,
      onSome: ({ shown }) => texts(shown),
    }),
    stack: occupant.stack,
    status,
  };
};

const emptySeat = (seat: number): SeatSnapshot => ({
  avatar: "",
  away: false,
  bet: 0,
  cardsHeld: 0,
  name: "",
  note: "",
  peeking: false,
  seat,
  shown: [],
  stack: 0,
  status: "Empty",
});

const seatHeldBy = (view: OpenView, player: PlayerId) =>
  view.seats.find(({ occupant }) =>
    Option.exists(occupant, (seated) => seated.player === player)
  )?.seat ?? null;

export const heroSeatOf = (view: OpenView) =>
  Option.fromNullishOr(
    view.seats.find(({ occupant }) =>
      Option.exists(occupant, ({ player }) => isYou(view, player))
    )?.seat
  );

const canTakeASeat = (view: OpenView, room: InRoom) =>
  Option.isNone(heroSeatOf(view)) &&
  !view.requests.seats.some(({ player }) => isYou(view, player)) &&
  Option.isNone(room.drafts.seat);

export const KEPT_CLOCK_SAMPLES = 8;

export const clockSampleOf = (view: OpenView, receivedAt: number) =>
  view.clocks.at - receivedAt;

const serverTimeAtArrival = (view: OpenView, room: InRoom) => {
  const receivedAt = Option.match(room.shown, {
    onNone: () => view.clocks.at,
    onSome: (shown) => shown.receivedAt,
  });

  return (
    receivedAt + Math.max(clockSampleOf(view, receivedAt), ...room.clockSamples)
  );
};

const clockOf = (view: OpenView, room: InRoom): ActionClock | null => {
  const serverNow = serverTimeAtArrival(view, room);

  const ring = ({
    deadline,
    remainingMs,
    seat,
    totalMs,
  }: {
    readonly deadline: number;
    readonly remainingMs: number;
    readonly seat: number;
    readonly totalMs: number;
  }): ActionClock => ({
    key: `${deadline}:${seat}`,
    remainingMs: Math.max(0, deadline - serverNow),
    seat,
    totalMs: Math.max(remainingMs, totalMs),
  });

  const turn = view.clocks.turn.pipe(Option.map(ring));

  const showdown = view.clocks.showdown.pipe(Option.map(ring));

  return Option.getOrNull(Option.orElse(turn, () => showdown));
};

const legalOfView = (view: OpenView): HeroLegal | null => {
  const nobodyBet = Option.match(view.hand, {
    onNone: () => true,
    onSome: (hand) => betToFace(hand) === 0,
  });

  const betting = view.legal.pipe(
    Option.map((legal): HeroLegal => ({
      call: Option.getOrNull(legal.call),
      check: legal.canCheck,
      fold: true,
      muck: false,
      raise: Option.getOrNull(
        legal.raise.pipe(
          Option.map(({ maxTo, minTo }) => ({
            isBet: nobodyBet,
            max: maxTo,
            min: minTo,
          }))
        )
      ),
      show: false,
    }))
  );

  const showdown = view.showdown.pipe(
    Option.filter(({ canMuck, canTable }) => canMuck || canTable),
    Option.map(({ canMuck, canTable }): HeroLegal => ({
      call: null,
      check: false,
      fold: false,
      muck: canMuck,
      raise: null,
      show: canTable,
    }))
  );

  return Option.getOrNull(Option.orElse(betting, () => showdown));
};

const waitingLine = (room: InRoom, view: OpenView) => {
  const acting = room.pending.find(({ acting: forTable }) => forTable);

  if (acting !== undefined) {
    return acting.label;
  }

  return Option.isSome(view.legal) && !isLive(room) ? "Reconnecting" : "";
};

const afterHandOf = (
  view: OpenView,
  room: InRoom,
  heroSeat: Option.Option<number>
): AfterHand => {
  const none: AfterHand = {
    bothOnly: false,
    closes: null,
    rabbit: false,
    showable: [],
  };

  if (Option.isSome(view.hand)) {
    return none;
  }

  return Option.match(view.lastHand, {
    onNone: () => none,
    onSome: (last) => {
      const shown = new Set(
        last.shown
          .filter(({ seat }) => Option.contains(heroSeat, seat))
          .flatMap(({ cards }) => cards)
      );

      const { table } = view.settings;

      const mayHunt = heroSeat.pipe(
        Option.flatMap((seat) =>
          view.you.pipe(Option.flatMap((you) => lastHandOf(view, you, seat)))
        ),
        Option.exists(
          ({ folded }) => table.rabbitHunters === "DealtIn" || !folded
        )
      );

      const serverNow = serverTimeAtArrival(view, room);

      return {
        bothOnly: table.voluntaryShows === "BothCards",
        closes: Option.getOrNull(
          view.clocks.nextDeal.pipe(
            Option.map(({ deadline }) => ({
              key: String(deadline),
              remainingMs: Math.max(0, deadline - serverNow),
            }))
          )
        ),
        rabbit:
          table.rabbitHunt &&
          mayHunt &&
          last.rabbit.length === 0 &&
          last.boards.some((board) => board.length < 5),
        showable: texts(last.yourCards.filter((card) => !shown.has(card))),
      };
    },
  });
};

const runVoteOf = (view: OpenView, heroSeat: Option.Option<number>) =>
  view.hand.pipe(
    Option.flatMap(({ choosingRuns }) => choosingRuns),
    Option.filter(({ seats }) =>
      Option.exists(heroSeat, (seat) => seats.some((voter) => voter === seat))
    ),
    Option.map(({ maxRuns }) => maxRuns),
    Option.getOrNull
  );

type HandView = Option.Option.Value<OpenView["hand"]>;

const POSTED_AS: Record<
  PostKind,
  (seat: number, hand: HandView) => Posted | null
> = {
  Ante: () => null,
  BigBlind: (seat, hand) =>
    seat === hand.bigBlindSeat ? "BigBlind" : "ToComeIn",
  DeadSmallBlind: () => "ToComeIn",
  SmallBlind: (seat, hand) =>
    seat === hand.smallBlindSeat ? "SmallBlind" : "ToComeIn",
  Straddle: () => "Straddle",
};

const isVoluntary = HappeningSchema.isAnyOf(["Bet", "Call", "Check", "Fold"]);

const postsSeen = (
  hand: HandView,
  seen: readonly Happening[]
): readonly SeatPost[] => {
  if (seen.some(HappeningSchema.guards.Collect)) {
    return [];
  }

  const acted = new Set(
    seen.flatMap((happening) =>
      isVoluntary(happening) ? [happening.seat] : []
    )
  );

  return seen
    .filter(HappeningSchema.guards.Post)
    .flatMap(({ kind, seat }) => {
      const posted = POSTED_AS[kind](seat, hand);

      return posted === null || acted.has(seat)
        ? []
        : [{ posted, seat, settled: acted.size > 0 }];
    })
    .filter(
      (post, index, all) =>
        all.findIndex(({ seat }) => seat === post.seat) === index
    );
};

const postsInView = (hand: HandView): readonly SeatPost[] =>
  hand.street === "Preflop"
    ? (
        [
          [hand.smallBlindSeat, "SmallBlind"],
          [hand.bigBlindSeat, "BigBlind"],
        ] as const
      ).flatMap(([seat, posted]) =>
        hand.players.some(
          (player) => player.seat === seat && player.committedThisStreet > 0
        )
          ? [{ posted, seat, settled: true }]
          : []
      )
    : [];

export const postsOf = (
  view: OpenView,
  events: readonly TableEvent[]
): readonly SeatPost[] =>
  Option.match(view.hand, {
    onNone: () => [],
    onSome: (hand) => {
      const start = events.findLastIndex(
        ({ happening }) =>
          HappeningSchema.guards.Start(happening) &&
          happening.hand === hand.handNumber
      );

      return start === -1
        ? postsInView(hand)
        : postsSeen(
            hand,
            events.slice(start + 1).map(({ happening }) => happening)
          );
    },
  });

const handFields = (view: OpenView) =>
  Option.match(view.hand, {
    onNone: () => {
      const last = Option.getOrNull(view.lastHand);

      return {
        boards: (last?.boards ?? []).map(texts),
        buttonSeat: null,
        handId: last?.handNumber ?? 0,
        heroCards: texts(last?.yourCards ?? []),
        pots: [],
        rabbit: texts(last?.rabbit ?? []),
        toAct: null,
      };
    },
    onSome: (hand) => ({
      boards: hand.boards.map(texts),
      buttonSeat: hand.button,
      handId: hand.handNumber,
      heroCards: texts(view.holeCards),
      pots: hand.pots.map(({ amount }) => amount),
      rabbit: [],
      toAct: Option.getOrNull(Option.orElse(hand.toAct, () => hand.toShow)),
    }),
  });

export const tableSnapshot = (
  room: InRoom,
  view: OpenView,
  presence: readonly PlayerId[],
  learned: readonly Hint[]
): TableSnapshot => {
  const heroSeat = heroSeatOf(view);
  const offerSeats = canTakeASeat(view, room);
  const context: SeatContext = { presence, room, view };

  const seats = view.seats
    .filter(({ seat }) => seat < view.settings.seats)
    .flatMap(({ occupant, seat }) =>
      Option.match(occupant, {
        onNone: () => (offerSeats ? [emptySeat(seat)] : []),
        onSome: (seated) => [occupiedSeat(context, seat, seated)],
      })
    );

  const free = isLive(room) && !isActing(room);

  return {
    ...handFields(view),
    afterHand: afterHandOf(view, room, heroSeat),
    bigBlind: view.settings.table.bigBlind,
    clock: clockOf(view, room),
    entry: Option.getOrNull(
      entryOf(view).pipe(
        Option.map((entry) => ({
          ...entryWords(entry),
          post: !entry.posting,
        }))
      )
    ),
    events: room.events,
    heroSeat: Option.getOrNull(heroSeat),
    hostTools: isYou(view, view.host),
    learned,
    legal: free ? legalOfView(view) : null,
    posts: postsOf(view, room.events),
    reactions: room.reactions.map(({ id, player, reaction }) => ({
      id,
      reaction,
      seat: seatHeldBy(view, player),
    })),
    runVote: free ? runVoteOf(view, heroSeat) : null,
    seats,
    waiting: waitingLine(room, view),
  };
};
