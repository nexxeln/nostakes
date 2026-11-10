import { Events, ShowdownEntries } from "@nostakes/engine";
import type { Card, Event, TableState } from "@nostakes/engine";
import { DealIndexSchema, Roles, openDealt } from "@nostakes/shuffle";
import type { DealingPlan, Role, SealedHand } from "@nostakes/shuffle";
import { Option } from "effect";

import { RoomEvents } from "./events.js";
import type { Holder, OpenedCard, RoomEvent } from "./events.js";
import { evolve } from "./evolve.js";
import { dealtDeck, sealedHandOf } from "./sealed-hand.js";
import { ProofDeals, isOpen, occupantAt } from "./state.js";
import type { Open, Proof, RoomState } from "./state.js";

interface Reveal {
  readonly holder: Option.Option<Holder>;
  readonly cards: readonly Card[];
}

const holderAt = (table: TableState, seat: Holder["seat"]) =>
  Option.map(occupantAt(table, seat), ({ player }) => ({ player, seat }));

const everyone = (cards: readonly Card[]): readonly Reveal[] => [
  { cards, holder: Option.none() },
];

const revealsOf = (table: TableState, event: Event): readonly Reveal[] => {
  if (Events.$is("HoleCardsDealt")(event)) {
    return Option.match(holderAt(table, event.seat), {
      onNone: () => [],
      onSome: (holder) => [{ cards: event.cards, holder: Option.some(holder) }],
    });
  }

  if (
    Events.$is("StreetDealt")(event) ||
    Events.$is("RabbitHunted")(event) ||
    Events.$is("CardsShown")(event) ||
    Events.$is("HandTabled")(event)
  ) {
    return everyone(event.cards);
  }

  if (Events.$is("HandsTabled")(event)) {
    return everyone(event.hands.flatMap((hand) => hand.cards));
  }

  return Events.$is("ShowdownReached")(event)
    ? everyone(
        event.order.flatMap((entry) =>
          ShowdownEntries.$is("Shown")(entry) ? entry.cards : []
        )
      )
    : [];
};

export const roleAt = (dealIndex: number, dealtIn: number): Role => {
  if (dealIndex < dealtIn) {
    return Roles.Hole({ pass: 0, turn: dealIndex });
  }

  return dealIndex < 2 * dealtIn
    ? Roles.Hole({ pass: 1, turn: dealIndex - dealtIn })
    : Roles.Community({ drawn: dealIndex - 2 * dealtIn });
};

const roleKey = (role: Role) =>
  Roles.$match(role, {
    Community: ({ drawn }) => `community ${drawn}`,
    Hole: ({ pass, turn }) => `hole ${turn}.${pass}`,
  });

const sameHolder = (
  left: Option.Option<Holder>,
  right: Option.Option<Holder>
) =>
  Option.match(left, {
    onNone: () => Option.isNone(right),
    onSome: (one) =>
      Option.exists(
        right,
        (other) => other.seat === one.seat && other.player === one.player
      ),
  });

const alreadyOpened = (
  proof: Proof,
  role: Role,
  holder: Option.Option<Holder>
) =>
  proof.opened.some(
    (opened) =>
      roleKey(opened.card.role) === roleKey(role) &&
      (Option.isNone(opened.holder) || sameHolder(opened.holder, holder))
  );

interface Opener {
  readonly plan: DealingPlan;
  readonly deck: readonly number[];
  readonly hand: () => SealedHand;
}

const openerOf = (state: Open, proof: Proof): Option.Option<Opener> =>
  ProofDeals.$match(proof.deal, {
    FromBeacon: ({ plan }) => {
      let sealedHand: SealedHand | undefined;

      return Option.some({
        deck: dealtDeck(proof.sealed, plan),
        hand: () => {
          sealedHand ??= sealedHandOf(state.code, proof.sealed);

          return sealedHand;
        },
        plan,
      });
    },
    WithoutBeacon: () => Option.none(),
  });

const openingsFor = (
  proof: Proof,
  opener: Opener,
  reveal: Reveal
): readonly OpenedCard[] =>
  reveal.cards.flatMap((card) => {
    const dealIndex = opener.deck.indexOf(card);

    if (dealIndex === -1) {
      return [];
    }

    const role = roleAt(dealIndex, proof.sealed.seats.length);

    if (alreadyOpened(proof, role, reveal.holder)) {
      return [];
    }

    return Option.match(
      openDealt(opener.hand(), opener.plan, DealIndexSchema.make(dealIndex)),
      {
        onNone: () => [],
        onSome: (opening) => [{ opening, role }],
      }
    );
  });

const openingEvents = (
  state: Open,
  event: RoomEvent,
  opener: (current: Open) => Option.Option<Opener>
): readonly RoomEvent[] => {
  if (!RoomEvents.$is("Table")(event) || Option.isNone(state.proof)) {
    return [];
  }

  const proof = state.proof.value;
  const reveals = revealsOf(state.table, event.event);

  if (reveals.length === 0) {
    return [];
  }

  return Option.match(opener(state), {
    onNone: () => [],
    onSome: (ready) =>
      reveals.flatMap((reveal) => {
        const openings = openingsFor(proof, ready, reveal);

        return openings.length === 0
          ? []
          : [
              RoomEvents.CardsOpened({
                at: event.at,
                hand: proof.sealed.hand,
                holder: reveal.holder,
                openings,
              }),
            ];
      }),
  });
};

interface CachedOpener {
  readonly proof: Proof;
  readonly ready: Option.Option<Opener>;
}

const openerCache = () => {
  let cached: CachedOpener | undefined;

  return (state: Open): Option.Option<Opener> => {
    const proof = Option.getOrUndefined(state.proof);

    if (proof === undefined) {
      return Option.none();
    }

    if (cached === undefined || cached.proof.sealed !== proof.sealed) {
      cached = { proof, ready: openerOf(state, proof) };
    }

    return cached.ready;
  };
};

const mayOpen = (before: RoomState, events: readonly RoomEvent[]) =>
  isOpen(before) &&
  (Option.isSome(before.proof) ||
    events.some(
      (event) =>
        RoomEvents.$is("DealtFromBeacon")(event) ||
        RoomEvents.$is("DealtWithoutBeacon")(event)
    ));

export const withOpenings = (
  before: RoomState,
  events: readonly RoomEvent[]
): readonly RoomEvent[] => {
  if (!mayOpen(before, events)) {
    return events;
  }

  const out: RoomEvent[] = [];
  const openerFor = openerCache();
  let state = before;

  for (const event of events) {
    out.push(event);
    state = evolve(state, event);

    const opened = isOpen(state) ? openingEvents(state, event, openerFor) : [];

    for (const more of opened) {
      out.push(more);
      state = evolve(state, more);
    }
  }

  return out;
};
