import { Events, ShowdownEntries } from "@nostakes/engine";
import type { Card, SeatIndex } from "@nostakes/engine";
import {
  CardSchema as SealedCardSchema,
  Deals,
  EpochMillisSchema,
  Roles,
  SealArrivals,
} from "@nostakes/shuffle";
import type {
  BeaconRound,
  DeckOpening,
  Digest,
  DrandChain,
  EpochMillis,
  HandEvidence,
  SealArrival,
  SealSeen,
  Sighting,
} from "@nostakes/shuffle";
import { Data, Option, Predicate, Result } from "effect";

import type { OpenedCard } from "./events.js";
import { RoomViews, SeenEvents } from "./views.js";
import type {
  DealtViewSchema,
  RoomView,
  RoomViewSchema,
  SeenEvent,
} from "./views.js";

type OpenView = typeof RoomViewSchema.cases.Open.Type;

interface SealSight {
  readonly round: BeaconRound;
  readonly roots: readonly [Digest, Digest];
  readonly seats: readonly SeatIndex[];
  readonly arrival: SealArrival;
  readonly withdrawn: Option.Option<SealArrival>;
}

export type DealSight = Data.TaggedEnum<{
  FromBeacon: {
    readonly round: BeaconRound;
    readonly signature: Uint8Array;
    readonly spare: DeckOpening;
  };
  WithoutBeacon: {
    readonly reason: "BeaconUnavailable";
    readonly dealtAt: Option.Option<EpochMillis>;
    readonly arrival: SealArrival;
  };
}>;

export const DealSights = Data.taggedEnum<DealSight>();

export interface HandSight {
  readonly seals: readonly SealSight[];
  readonly started: boolean;
  readonly deal: Option.Option<DealSight>;
  readonly dealt: Option.Option<readonly SeatIndex[]>;
  readonly openings: readonly OpenedCard[];
  readonly own: ReadonlyMap<SeatIndex, readonly Card[]>;
  readonly community: readonly Card[];
  readonly shown: ReadonlyMap<SeatIndex, readonly Card[]>;
  readonly seenOnlyInViews: ReadonlySet<Card>;
}

export interface Witness {
  readonly hands: ReadonlyMap<number, HandSight>;
  readonly current: Option.Option<number>;
}

export const emptyWitness: Witness = {
  current: Option.none(),
  hands: new Map(),
};

const blankHand: HandSight = {
  community: [],
  deal: Option.none(),
  dealt: Option.none(),
  openings: [],
  own: new Map(),
  seals: [],
  seenOnlyInViews: new Set(),
  shown: new Map(),
  started: false,
};

const cardsOf = (sight: HandSight): ReadonlySet<Card> =>
  new Set([
    ...sight.community,
    ...[...sight.own.values()].flat(),
    ...[...sight.shown.values()].flat(),
  ]);

const withHand = (
  witness: Witness,
  hand: number,
  change: (sight: HandSight) => HandSight
): Witness => ({
  ...witness,
  hands: new Map([
    ...witness.hands,
    [hand, change(witness.hands.get(hand) ?? blankHand)],
  ]),
});

const onCurrent = (
  witness: Witness,
  change: (sight: HandSight) => HandSight
): Witness =>
  Option.match(witness.current, {
    onNone: () => witness,
    onSome: (hand) => withHand(witness, hand, change),
  });

const union = (known: readonly Card[], more: readonly Card[]) => [
  ...known,
  ...more.filter((card) => !known.includes(card)),
];

const addShown = (
  sight: HandSight,
  seat: SeatIndex,
  cards: readonly Card[]
): HandSight =>
  cards.length === 0
    ? sight
    : {
        ...sight,
        shown: new Map([
          ...sight.shown,
          [seat, union(sight.shown.get(seat) ?? [], cards)],
        ]),
      };

const addAllShown = (
  sight: HandSight,
  hands: readonly {
    readonly seat: SeatIndex;
    readonly cards: readonly Card[];
  }[]
): HandSight => {
  let next = sight;

  for (const hand of hands) {
    next = addShown(next, hand.seat, hand.cards);
  }

  return next;
};

const addOwn = (
  sight: HandSight,
  seat: SeatIndex,
  cards: readonly Card[]
): HandSight =>
  cards.length === 0 || sight.own.has(seat)
    ? sight
    : { ...sight, own: new Map([...sight.own, [seat, cards]]) };

const addCommunity = (sight: HandSight, cards: readonly Card[]): HandSight => ({
  ...sight,
  community: union(sight.community, cards),
});

const addDealt = (sight: HandSight, seats: readonly SeatIndex[]): HandSight =>
  Option.isSome(sight.dealt) ? sight : { ...sight, dealt: Option.some(seats) };

const sameRoots = (left: SealSight["roots"], right: SealSight["roots"]) =>
  left.every((root, slot) =>
    root.every((byte, index) => byte === right[slot]?.[index])
  );

const addSeal = (
  sight: HandSight,
  seal: Omit<SealSight, "withdrawn">
): HandSight =>
  sight.seals.some((known) => sameRoots(known.roots, seal.roots))
    ? sight
    : {
        ...sight,
        seals: [...sight.seals, { ...seal, withdrawn: Option.none() }],
      };

const withdrawSeal = (
  sight: HandSight,
  round: BeaconRound,
  arrival: SealArrival
): HandSight => {
  const index = sight.seals.findLastIndex(
    (seal) => seal.round === round && Option.isNone(seal.withdrawn)
  );

  return index === -1
    ? sight
    : {
        ...sight,
        seals: sight.seals.map((seal, at) =>
          at === index ? { ...seal, withdrawn: Option.some(arrival) } : seal
        ),
      };
};

const dealtSeal = (sight: HandSight): Option.Option<SealSight> =>
  Option.fromUndefinedOr(
    sight.seals.findLast((seal) => Option.isNone(seal.withdrawn))
  );

const addDeal = (sight: HandSight, deal: DealSight): HandSight =>
  Option.isSome(sight.deal) ? sight : { ...sight, deal: Option.some(deal) };

const roleKey = (card: OpenedCard) =>
  Roles.$match(card.role, {
    Community: ({ drawn }) => `c${drawn}`,
    Hole: ({ pass, turn }) => `h${turn}.${pass}`,
  });

const openingKey = (card: OpenedCard) =>
  `${roleKey(card)}:${card.opening.position}:${card.opening.card}`;

const addOpenings = (
  sight: HandSight,
  openings: readonly OpenedCard[]
): HandSight => {
  const known = new Set(sight.openings.map(openingKey));

  return {
    ...sight,
    openings: [
      ...sight.openings,
      ...openings.filter((opened) => !known.has(openingKey(opened))),
    ],
  };
};

const afterButton = (seats: readonly SeatIndex[], button: SeatIndex) => [
  ...seats.filter((seat) => seat > button),
  ...seats.filter((seat) => seat <= button),
];

const seenTable = (witness: Witness, event: SeenEvent): Witness => {
  if (!SeenEvents.$is("Table")(event)) {
    return witness;
  }

  const table = event.event;

  if (Predicate.isTagged(table, "HandStarted")) {
    return withHand(
      { ...witness, current: Option.some(table.handNumber) },
      table.handNumber,
      (sight) => ({
        ...addDealt(sight, afterButton(table.dealtIn, table.button)),
        started: true,
      })
    );
  }

  if (Events.$is("HoleCardsDealt")(table)) {
    return onCurrent(witness, (sight) =>
      addOwn(sight, table.seat, table.cards)
    );
  }

  if (Events.$is("StreetDealt")(table) || Events.$is("RabbitHunted")(table)) {
    return onCurrent(witness, (sight) => addCommunity(sight, table.cards));
  }

  if (Events.$is("CardsShown")(table) || Events.$is("HandTabled")(table)) {
    return onCurrent(witness, (sight) =>
      addShown(sight, table.seat, table.cards)
    );
  }

  if (Events.$is("HandsTabled")(table)) {
    return onCurrent(witness, (sight) => addAllShown(sight, table.hands));
  }

  return Events.$is("ShowdownReached")(table)
    ? onCurrent(witness, (sight) =>
        addAllShown(
          sight,
          table.order.flatMap((entry) =>
            ShowdownEntries.$is("Shown")(entry) ? [entry] : []
          )
        )
      )
    : witness;
};

export const witnessEvent = (
  witness: Witness,
  event: SeenEvent,
  arrival: SealArrival
): Witness => {
  if (SeenEvents.$is("HandSealed")(event)) {
    return withHand(witness, event.hand, (sight) =>
      addSeal(sight, {
        arrival,
        roots: event.roots,
        round: event.round,
        seats: event.seats,
      })
    );
  }

  if (SeenEvents.$is("SealWithdrawn")(event)) {
    return withHand(witness, event.hand, (sight) =>
      withdrawSeal(sight, event.round, arrival)
    );
  }

  if (SeenEvents.$is("DealtFromBeacon")(event)) {
    return withHand(
      { ...witness, current: Option.some(event.hand) },
      event.hand,
      (sight) =>
        addDeal(
          sight,
          DealSights.FromBeacon({
            round: event.round,
            signature: event.signature,
            spare: event.spare,
          })
        )
    );
  }

  if (SeenEvents.$is("DealtWithoutBeacon")(event)) {
    return withHand(
      { ...witness, current: Option.some(event.hand) },
      event.hand,
      (sight) =>
        addDeal(
          sight,
          DealSights.WithoutBeacon({
            arrival,
            dealtAt: Option.some(EpochMillisSchema.make(event.at)),
            reason: event.reason,
          })
        )
    );
  }

  if (SeenEvents.$is("CardsOpened")(event)) {
    return withHand(witness, event.hand, (sight) =>
      addOpenings(sight, event.openings)
    );
  }

  return seenTable(witness, event);
};

const yourSeat = (view: OpenView) =>
  view.you.pipe(
    Option.flatMap((you) =>
      Option.fromUndefinedOr(
        view.seats.find((seat) =>
          Option.exists(seat.occupant, (occupant) => occupant.player === you)
        )?.seat
      )
    )
  );

const drawOrder = (
  boards: readonly (readonly Card[])[],
  rabbit: readonly Card[]
): readonly Card[] => {
  const [first = [], ...rest] = boards;

  const shared = first.filter((card, index) =>
    rest.every((board) => board[index] === card)
  ).length;

  return [...first, ...rest.flatMap((board) => board.slice(shared)), ...rabbit];
};

interface TableSeen {
  readonly own: Option.Option<readonly Card[]>;
  readonly community: readonly Card[];
  readonly shown: readonly {
    readonly seat: SeatIndex;
    readonly cards: readonly Card[];
  }[];
  readonly dealt: Option.Option<readonly SeatIndex[]>;
}

const tableSeen = (view: OpenView, hand: number): Option.Option<TableSeen> =>
  Option.match(view.hand, {
    onNone: () =>
      view.lastHand.pipe(
        Option.filter((last) => last.handNumber === hand),
        Option.map((last): TableSeen => ({
          community: drawOrder(last.boards, last.rabbit),
          dealt: Option.none(),
          own: Option.some(last.yourCards),
          shown: last.shown,
        }))
      ),
    onSome: (current) =>
      current.handNumber === hand
        ? Option.some<TableSeen>({
            community: drawOrder(current.boards, []),
            dealt: Option.some(
              afterButton(
                current.players.map((player) => player.seat),
                current.button
              )
            ),
            own: Option.some(view.holeCards),
            shown: current.players.map(({ seat, shown }) => ({
              cards: shown,
              seat,
            })),
          })
        : Option.none<TableSeen>(),
  });

const tableCards = (table: TableSeen): ReadonlySet<Card> =>
  new Set([
    ...table.community,
    ...Option.getOrElse(table.own, () => []),
    ...table.shown.flatMap(({ cards }) => cards),
  ]);

const dealSightOf = (
  deal: (typeof DealtViewSchema.Type)["deal"],
  arrival: SealArrival
): DealSight =>
  Predicate.isTagged(deal, "FromBeacon")
    ? DealSights.FromBeacon({
        round: deal.round,
        signature: deal.signature,
        spare: deal.spare,
      })
    : DealSights.WithoutBeacon({
        arrival,
        dealtAt: deal.at.pipe(Option.map((at) => EpochMillisSchema.make(at))),
        reason: deal.reason,
      });

const handOnTable = (view: OpenView): Option.Option<number> =>
  view.hand.pipe(
    Option.map((hand) => hand.handNumber),
    Option.orElse(() =>
      view.lastHand.pipe(Option.map((last) => last.handNumber))
    )
  );

const withTableSeen = (
  sight: HandSight,
  table: TableSeen,
  seat: Option.Option<SeatIndex>
): HandSight => {
  const withOwn = Option.match(Option.all([table.own, seat]), {
    onNone: () => sight,
    onSome: ([cards, ownSeat]) => addOwn(sight, ownSeat, cards),
  });

  const withDealt = Option.match(table.dealt, {
    onNone: () => withOwn,
    onSome: (seats) => addDealt(withOwn, seats),
  });

  return addAllShown(addCommunity(withDealt, table.community), table.shown);
};

const tableOf = (witness: Witness, view: OpenView): Witness =>
  Option.match(handOnTable(view), {
    onNone: () => witness,
    onSome: (hand) =>
      Option.match(tableSeen(view, hand), {
        onNone: () => ({ ...witness, current: Option.some(hand) }),
        onSome: (table) =>
          withHand(
            { ...witness, current: Option.some(hand) },
            hand,
            (sight) => {
              const before = cardsOf(sight);
              const after = withTableSeen(sight, table, yourSeat(view));

              return {
                ...after,
                seenOnlyInViews: new Set([
                  ...sight.seenOnlyInViews,
                  ...[...cardsOf(after)].filter((card) => !before.has(card)),
                ]),
              };
            }
          ),
      }),
  });

const seenOpenView = (
  witness: Witness,
  view: OpenView,
  at: SealArrival["at"]
): Witness => {
  const caughtUp = SealArrivals.CaughtUp({ at });
  const tabled = tableOf(witness, view);

  const sealed = Option.match(view.fairness.sealed, {
    onNone: () => tabled,
    onSome: (seal) =>
      withHand(tabled, seal.hand, (sight) =>
        addSeal(sight, {
          arrival: caughtUp,
          roots: seal.roots,
          round: seal.round,
          seats: seal.seats,
        })
      ),
  });

  return Option.match(view.fairness.dealt, {
    onNone: () => sealed,
    onSome: (dealt) => {
      const { hand } = dealt.seal;

      const covered = tableSeen(view, hand).pipe(
        Option.map(tableCards),
        Option.getOrElse((): ReadonlySet<Card> => new Set())
      );

      const current = Option.match(sealed.current, {
        onNone: () => Option.some(hand),
        onSome: (known) => Option.some(Math.max(known, hand)),
      });

      return withHand({ ...sealed, current }, hand, (sight) =>
        addOpenings(
          addDeal(
            addSeal(
              {
                ...sight,
                seenOnlyInViews: new Set(
                  [...sight.seenOnlyInViews].filter(
                    (card) => !covered.has(card)
                  )
                ),
              },
              {
                arrival: caughtUp,
                roots: dealt.seal.roots,
                round: dealt.seal.round,
                seats: dealt.seal.seats,
              }
            ),
            dealSightOf(dealt.deal, caughtUp)
          ),
          dealt.openings
        )
      );
    },
  });
};

export const witnessView = (
  witness: Witness,
  view: RoomView,
  at: SealArrival["at"]
): Witness =>
  RoomViews.$is("Open")(view) ? seenOpenView(witness, view, at) : witness;

export type MissingEvidence = Data.TaggedEnum<{
  NotSealed: { readonly hand: number };
  NoSeal: { readonly hand: number };
  NoDeal: { readonly hand: number };
  NoDealtSeats: { readonly hand: number };
  Unopened: { readonly hand: number; readonly cards: readonly Card[] };
}>;

export const MissingEvidences = Data.taggedEnum<MissingEvidence>();

const openingFor = (
  openings: readonly OpenedCard[],
  key: string
): Option.Option<OpenedCard> =>
  Option.fromUndefinedOr(openings.find((opened) => roleKey(opened) === key));

const sighting = (opened: OpenedCard, shown: Card): Sighting => ({
  opening: opened.opening,
  role: opened.role,
  shown: SealedCardSchema.make(shown),
});

interface Collected {
  readonly sightings: readonly Sighting[];
  readonly unopened: readonly Card[];
}

const atRole = (
  openings: readonly OpenedCard[],
  key: string,
  shown: Card
): Collected =>
  Option.match(openingFor(openings, key), {
    onNone: () => ({ sightings: [], unopened: [shown] }),
    onSome: (opened) => ({
      sightings: [sighting(opened, shown)],
      unopened: [],
    }),
  });

const holeOpeningsOf = (openings: readonly OpenedCard[], turn: number) =>
  openings.filter((opened) =>
    Roles.$match(opened.role, {
      Community: () => false,
      Hole: (hole) => hole.turn === turn,
    })
  );

const shownOfSeat = (
  openings: readonly OpenedCard[],
  turn: number,
  cards: readonly Card[]
): Collected => {
  const held = holeOpeningsOf(openings, turn);
  const matched = held.filter((opened) => cards.includes(opened.opening.card));
  const strayOpenings = held.filter((opened) => !matched.includes(opened));

  const unmatched = cards.filter(
    (card) => !matched.some((opened) => opened.opening.card === card)
  );

  const paired = strayOpenings.flatMap((opened, index) => {
    const shown = unmatched[index];

    return shown === undefined ? [] : [sighting(opened, shown)];
  });

  return {
    sightings: [
      ...matched.map((opened) => sighting(opened, opened.opening.card)),
      ...paired,
    ],
    unopened: unmatched.slice(paired.length),
  };
};

const collect = (parts: readonly Collected[]): Collected => ({
  sightings: parts.flatMap((part) => part.sightings),
  unopened: parts.flatMap((part) => part.unopened),
});

const sightingsOf = (
  sight: HandSight,
  dealt: readonly SeatIndex[]
): Collected =>
  collect([
    ...[...sight.own].flatMap(([seat, cards]) => {
      const turn = dealt.indexOf(seat);

      return cards.map((card, pass) =>
        turn === -1
          ? { sightings: [], unopened: [card] }
          : atRole(sight.openings, `h${turn}.${pass}`, card)
      );
    }),
    ...sight.community.map((card, drawn) =>
      atRole(sight.openings, `c${drawn}`, card)
    ),
    ...[...sight.shown].map(([seat, cards]) => {
      const turn = dealt.indexOf(seat);

      return turn === -1
        ? { sightings: [], unopened: cards }
        : shownOfSeat(sight.openings, turn, cards);
    }),
  ]);

export const evidenceFor = (
  witness: Witness,
  hand: number,
  room: string,
  chain: DrandChain
): Result.Result<HandEvidence, MissingEvidence> => {
  const sight = witness.hands.get(hand) ?? blankHand;
  const sealed = dealtSeal(sight);

  if (Option.isNone(sight.deal)) {
    return Result.fail(
      sight.started && sight.seals.length === 0
        ? MissingEvidences.NotSealed({ hand })
        : MissingEvidences.NoDeal({ hand })
    );
  }

  if (Option.isNone(sealed)) {
    return Result.fail(MissingEvidences.NoSeal({ hand }));
  }

  const seal = sealed.value;

  const common = {
    chain,
    context: { hand, room },
    seal: { beaconRound: seal.round, roots: seal.roots, seats: seal.seats },
    sealArrival: seal.arrival,
  };

  return DealSights.$match(sight.deal.value, {
    FromBeacon: ({ round, signature, spare }) => {
      if (Option.isNone(sight.dealt)) {
        return Result.fail(MissingEvidences.NoDealtSeats({ hand }));
      }

      const collected = sightingsOf(sight, sight.dealt.value);

      const unopened = collected.unopened.filter(
        (card) => !sight.seenOnlyInViews.has(card)
      );

      return unopened.length > 0
        ? Result.fail(MissingEvidences.Unopened({ cards: unopened, hand }))
        : Result.succeed({
            ...common,
            deal: Deals.FromBeacon({
              round,
              seats: sight.dealt.value,
              sightings: collected.sightings,
              signature,
              spare,
            }),
          });
    },
    WithoutBeacon: ({ arrival, dealtAt }) =>
      Result.succeed({
        ...common,
        deal: Deals.BeaconUnavailable({ arrival, dealtAt, round: seal.round }),
      }),
  });
};

export const sealsSeen = (witness: Witness): readonly SealSeen[] =>
  [...witness.hands].flatMap(([hand, sight]) => {
    const dealt = Option.isSome(sight.deal) ? dealtSeal(sight) : Option.none();

    return sight.seals.map((seal) => ({
      dealt: Option.contains(dealt, seal),
      hand,
      round: seal.round,
      withdrawn: seal.withdrawn,
    }));
  });

export const handsWitnessed = (witness: Witness): readonly number[] =>
  [...witness.hands.keys()].toSorted((left, right) => left - right);
