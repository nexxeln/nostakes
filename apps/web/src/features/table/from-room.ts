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

export const initialsOf = (name: string) => {
  const [first] = new Intl.Segmenter().segment(name.trim());

  return (first?.segment ?? "").toLocaleUpperCase();
};

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

  if (occupant.away || !here) {
    return "Away";
  }

  return occupant.straddling ? "Straddle" : "";
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
    cardsHeld: status === "Folded" || status === "Out" ? 0 : ownCards,
    initials: initialsOf(member?.name ?? "?"),
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
  initials: "Sit",
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

const SECOND = 1000;

const clockOf = (view: OpenView, room: InRoom): ActionClock | null => {
  const key = Option.match(room.link, {
    onNone: () => 0,
    onSome: ({ receivedAt }) => receivedAt,
  });

  const { settings } = view;

  const turn = view.clocks.turn.pipe(
    Option.map(({ inTimeBank, remainingMs, seat }) => ({
      key,
      remainingMs,
      seat,
      totalMs: Math.max(
        remainingMs,
        (inTimeBank ? settings.timeBankSeconds : settings.turnSeconds) * SECOND
      ),
    }))
  );

  const showdown = view.clocks.showdown.pipe(
    Option.map(({ remainingMs, seat }) => ({
      key,
      remainingMs,
      seat,
      totalMs: Math.max(remainingMs, settings.showdownSeconds * SECOND),
    }))
  );

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

  const hand = Option.getOrNull(view.hand);
  const last = Option.getOrNull(view.lastHand);

  return {
    bigBlind: view.settings.table.bigBlind,
    boards: (hand?.boards ?? last?.boards ?? []).map(texts),
    buttonSeat: hand?.button ?? null,
    clock: clockOf(view, room),
    events: room.events,
    handId: hand?.handNumber ?? last?.handNumber ?? 0,
    heroCards: texts(hand === null ? (last?.yourCards ?? []) : view.holeCards),
    heroSeat: Option.getOrNull(heroSeat),
    learned,
    legal: isLive(room) && !isActing(room) ? legalOfView(view) : null,
    pots: (hand?.pots ?? []).map(({ amount }) => amount),
    seats,
    toAct:
      hand === null
        ? null
        : Option.getOrNull(Option.orElse(hand.toAct, () => hand.toShow)),
    waiting: waitingLine(room, view),
  };
};
