import { cardText, handCategory } from "@nostakes/engine";
import type { Card, HandCategory, HandRank } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/protocol";
import { SeenEvents } from "@nostakes/room";
import type { SeenEvent, SeenTableEvent } from "@nostakes/room";
import { Match, Option } from "effect";

import type { InRoom } from "../model.js";
import { isActing, isLive } from "../room.js";
import type { OpenView } from "../room.js";
import { HappeningSchema, Happenings } from "./snapshot.js";
import type {
  ActionClock,
  AfterHand,
  Happening,
  HeroLegal,
  Hint,
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

const tableHappenings = (event: SeenTableEvent): readonly Happening[] =>
  Match.value(event).pipe(
    Match.tagsExhaustive({
      AntePosted: ({ amount, seat }) => [
        Happenings.Post.make({ amount, label: `Ante ${amount}`, seat }),
      ],
      BlindPosted: ({ amount, blind, seat }) => [
        Happenings.Post.make({
          amount,
          label: `${blind === "Small" ? "Small" : "Big"} blind ${amount}`,
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
        Happenings.Bet.make({ added, allIn, seat, to }),
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
        Happenings.Post.make({ amount, label: `Straddle ${amount}`, seat }),
      ],
      StreetDealt: ({ street }) => [Happenings.Collect.make({ street })],
      UncalledBetReturned: ({ amount, seat }) => [
        Happenings.Return.make({ amount, seat }),
      ],
    })
  );

export const happeningsOf = (
  seq: number,
  event: SeenEvent
): readonly TableEvent[] =>
  SeenEvents.$is("Table")(event)
    ? tableHappenings(event.event).map((happening, index) => ({
        happening,
        id: seq * HAPPENINGS_PER_EVENT + index,
      }))
    : [];

const lastStart = (events: readonly TableEvent[]) =>
  events.findLastIndex(({ happening }) =>
    HappeningSchema.guards.Start(happening)
  );

const foldedSinceStart = (events: readonly TableEvent[]) =>
  new Set(
    events
      .slice(Math.max(0, lastStart(events)))
      .flatMap(({ happening }) =>
        HappeningSchema.guards.Fold(happening) ? [happening.seat] : []
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
  readonly folded: ReadonlySet<number>;
}

const noteOf = (occupant: Occupant, here: boolean) => {
  if (occupant.leaving) {
    return "Leaving";
  }

  if (occupant.sittingOut) {
    return "Sitting out";
  }

  return occupant.away || !here ? "Away" : "";
};

const statusBetweenHands = (
  occupant: Occupant,
  seat: number,
  folded: ReadonlySet<number>
): SeatStatus => {
  if (occupant.sittingOut) {
    return "Out";
  }

  return folded.has(seat) ? "Folded" : "In";
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
  const { folded, presence, room, view } = context;
  const mine = occupant.player === room.player;
  const here = presence.includes(occupant.player);
  const member = view.members.find(({ player }) => player === occupant.player);

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
        : statusBetweenHands(occupant, seat, folded),
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

  return {
    avatar: member?.avatar ?? "",
    away: occupant.away || !here,
    bet: Option.match(inHand, {
      onNone: () => 0,
      onSome: ({ committedThisStreet }) => committedThisStreet,
    }),
    cardsHeld: heldCards({
      between: Option.isNone(view.hand),
      heroCards,
      mine,
      ownCards,
      status,
    }),
    name: mine ? "You" : (member?.name ?? "Someone"),
    note: noteOf(occupant, here),
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
  seat,
  shown: [],
  stack: 0,
  status: "Empty",
});

export const heroSeatOf = (view: OpenView, room: InRoom) =>
  Option.fromNullishOr(
    view.seats.find(({ occupant }) =>
      Option.exists(occupant, ({ player }) => player === room.player)
    )?.seat
  );

const canTakeASeat = (view: OpenView, room: InRoom) =>
  Option.isNone(heroSeatOf(view, room)) &&
  !view.requests.seats.some(({ player }) => player === room.player) &&
  Option.isNone(room.drafts.seat);

const clockOf = (view: OpenView, room: InRoom): ActionClock | null => {
  const key = Option.match(room.shown, {
    onNone: () => 0,
    onSome: ({ receivedAt }) => receivedAt,
  });

  const ring = ({
    remainingMs,
    seat,
    totalMs,
  }: {
    readonly remainingMs: number;
    readonly seat: number;
    readonly totalMs: number;
  }): ActionClock => ({
    key,
    remainingMs,
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
    onSome: ({ players }) =>
      players.every(({ committedThisStreet }) => committedThisStreet === 0),
  });

  const betting = view.legal.pipe(
    Option.map((legal): HeroLegal => ({
      call: Option.getOrNull(legal.call),
      check: legal.canCheck,
      fold: true,
      muck: false,
      raise: Option.getOrNull(
        legal.raise.pipe(
          Option.filter(({ maxTo, minTo }) => minTo <= maxTo),
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
  heroSeat: Option.Option<number>,
  folded: ReadonlySet<number>
): AfterHand => {
  const none: AfterHand = { bothOnly: false, rabbit: false, showable: [] };

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
      const stillIn = Option.exists(heroSeat, (seat) => !folded.has(seat));

      const mayHunt =
        Option.isSome(heroSeat) &&
        (table.rabbitHunters === "DealtIn" || stillIn);

      return {
        bothOnly: table.voluntaryShows === "BothCards",
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
  const heroSeat = heroSeatOf(view, room);
  const offerSeats = canTakeASeat(view, room);
  const folded = foldedSinceStart(room.events);
  const context: SeatContext = { folded, presence, room, view };

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
    afterHand: afterHandOf(view, heroSeat, folded),
    bigBlind: view.settings.table.bigBlind,
    clock: clockOf(view, room),
    events: room.events,
    heroSeat: Option.getOrNull(heroSeat),
    hostTools: view.host === room.player,
    learned,
    legal: free ? legalOfView(view) : null,
    runVote: free ? runVoteOf(view, heroSeat) : null,
    seats,
    waiting: waitingLine(room, view),
  };
};
