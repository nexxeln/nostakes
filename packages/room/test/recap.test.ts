import { describe, expect, it } from "@effect/vitest";
import {
  ChipsSchema,
  Events,
  PlayerIdSchema,
  ShowdownEntries,
} from "@nostakes/engine";
import type { Card, Event, PlayerId, SeatIndex } from "@nostakes/engine";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  Audiences,
  NO_TALLY,
  RoomEvents,
  SEATS,
  SeenEvents,
  millis,
  recapOf,
  redact,
  tallied,
} from "../src/index.js";
import type {
  Audience,
  MomentCallouts,
  NightRecap,
  RoomEvent,
  SeenTableEvent,
} from "../src/index.js";
import { generatedHand } from "./moment-hands.js";
import { seededRandom } from "./random.js";
import { generated } from "./scale.js";

const nightSeed = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2_000_000_000, minimum: 1 }))
);

const FOLDING_AUDIENCES = 4;

const playerAt = (seat: number) => PlayerIdSchema.make(`p${seat}`);

const renumbered = (event: Event, hand: number): Event => {
  if (Events.$is("HandStarted")(event)) {
    return Events.HandStarted({
      bigBlindSeat: event.bigBlindSeat,
      button: event.button,
      dealtIn: event.dealtIn,
      deck: event.deck,
      handNumber: hand,
      smallBlindSeat: event.smallBlindSeat,
    });
  }

  return Events.$is("HandEnded")(event)
    ? Events.HandEnded({ handNumber: hand })
    : event;
};

const nightOf = (seed: number): readonly RoomEvent[] => {
  const random = seededRandom(seed);
  const hands = 3 + random.below(4);
  let at = 0;

  const table = (event: Event) => {
    at += 1 + random.below(5000);

    return RoomEvents.Table({ at: millis(at), event });
  };

  const seated = SEATS.map((seat) =>
    RoomEvents.BoughtIn({
      amount: ChipsSchema.make(1000),
      at: millis(0),
      player: playerAt(seat),
      seat,
    })
  );

  const played = Array.from({ length: hands }, (_, index) =>
    generatedHand(random).map((event) => table(renumbered(event, index + 1)))
  ).flat();

  return [
    ...seated,
    ...played,
    RoomEvents.RoomClosed({
      at: millis(at + 1),
      settlement: { balances: [], transfers: [] },
    }),
  ];
};

const audiencesFor = (events: readonly RoomEvent[]): readonly Audience[] => {
  const dealt = new Set<SeatIndex>();

  for (const event of events) {
    if (
      RoomEvents.$is("Table")(event) &&
      Events.$is("HoleCardsDealt")(event.event)
    ) {
      dealt.add(event.event.seat);
    }
  }

  return [
    Audiences.Spectator(),
    Audiences.Unseated({ player: PlayerIdSchema.make("watcher") }),
    ...[...dealt].map((seat) =>
      Audiences.Seated({ player: playerAt(seat), seat })
    ),
  ];
};

const talliedFor = (events: readonly RoomEvent[], audience: Audience) => {
  let tally = NO_TALLY;

  for (const event of events) {
    tally = tallied(tally, redact(event, audience));
  }

  return tally;
};

const foldedFor = (
  events: readonly RoomEvent[],
  audience: Audience,
  callouts: MomentCallouts
) => recapOf(talliedFor(events, audience), callouts);

interface PlayedHand {
  readonly endedAt: Option.Option<number>;
  readonly events: readonly SeenTableEvent[];
  readonly hand: number;
  readonly seats: ReadonlyMap<SeatIndex, PlayerId>;
  readonly startedAt: number;
}

const handsIn = (
  events: readonly RoomEvent[],
  seatsAt: (index: number) => ReadonlyMap<SeatIndex, PlayerId>
): readonly PlayedHand[] => {
  const hands: PlayedHand[] = [];
  let open = false;

  for (const [index, event] of events.entries()) {
    const seen = redact(event, Audiences.Spectator());

    if (RoomEvents.$is("HandCancelled")(event) && open) {
      hands.pop();
      open = false;
    }

    if (!SeenEvents.$is("Table")(seen)) {
      continue;
    }

    const table = seen.event;

    if (Events.$is("HandStarted")(table)) {
      open = true;
      hands.push({
        endedAt: Option.none(),
        events: [table],
        hand: table.handNumber,
        seats: seatsAt(index),
        startedAt: seen.at,
      });

      continue;
    }

    const last = hands.at(-1);

    if (open && last !== undefined) {
      hands[hands.length - 1] = {
        ...last,
        endedAt: Events.$is("HandEnded")(table)
          ? Option.some(seen.at)
          : last.endedAt,
        events: [...last.events, table],
      };
    }
  }

  return hands.filter((hand) => Option.isSome(hand.endedAt));
};

const fixedSeats = () =>
  new Map(SEATS.map((seat) => [seat, playerAt(seat)] as const));

const shownBy = (event: SeenTableEvent): readonly Card[] => {
  if (Events.$is("CardsShown")(event) || Events.$is("HandTabled")(event)) {
    return event.cards;
  }

  if (Events.$is("HandsTabled")(event)) {
    return event.hands.flatMap((hand) => hand.cards);
  }

  return Events.$is("ShowdownReached")(event)
    ? event.order.flatMap((entry) =>
        ShowdownEntries.$is("Shown")(entry) ? entry.cards : []
      )
    : [];
};

const publicIn = (events: readonly SeenTableEvent[]) => ({
  board: new Set(
    events.flatMap((event) =>
      Events.$is("StreetDealt")(event) ? event.cards : []
    )
  ),
  shown: new Set(events.flatMap(shownBy)),
});

const unshownCards = (
  recap: NightRecap,
  hands: readonly PlayedHand[]
): readonly string[] =>
  recap.moments.flatMap((recapped) => {
    const hand = hands.find(({ hand: number }) => number === recapped.hand);
    const known = publicIn(hand?.events ?? []);

    return [
      ...recapped.players.flatMap(({ seat, shown }) =>
        shown
          .filter((card) => !known.shown.has(card))
          .map((card) => `hand ${recapped.hand} seat ${seat} card ${card}`)
      ),
      ...recapped.boards
        .flat()
        .filter((card) => !known.board.has(card))
        .map((card) => `hand ${recapped.hand} board card ${card}`),
    ];
  });

describe("the night's recap", () => {
  it.prop(
    "is the same for a spectator, a member not seated, and every player dealt in",
    { seed: nightSeed },
    ({ seed }) => {
      const night = nightOf(seed);
      const seen = foldedFor(night, Audiences.Spectator(), "All");

      for (const audience of audiencesFor(night)) {
        expect(foldedFor(night, audience, "All")).toStrictEqual(seen);
      }
    },
    generated(2, 4)
  );

  it.prop(
    "never holds a card that was not shown in its own hand, whoever folds it",
    { seed: nightSeed },
    ({ seed }) => {
      const night = nightOf(seed);
      const hands = handsIn(night, fixedSeats);

      for (const audience of audiencesFor(night).slice(0, FOLDING_AUDIENCES)) {
        expect(
          unshownCards(foldedFor(night, audience, "All"), hands)
        ).toStrictEqual([]);
      }
    },
    generated(2, 4)
  );
});
