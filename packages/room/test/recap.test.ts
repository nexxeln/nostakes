import { describe, expect, it } from "@effect/vitest";
import {
  ChipsSchema,
  Events,
  PlayerIdSchema,
  Seats,
  ShowdownEntries,
} from "@nostakes/engine";
import type { Card, Event, PlayerId, SeatIndex } from "@nostakes/engine";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { storyOf } from "../src/hand-story.js";
import {
  Audiences,
  NO_TALLY,
  RECAP_MOMENTS,
  RoomEvents,
  RoomStates,
  RoomViews,
  SEATS,
  SeenEvents,
  isPainful,
  millis,
  momentsOf,
  recapOf,
  recapOrder,
  evolve,
  redact,
  tallied,
  viewFor,
} from "../src/index.js";
import type {
  Audience,
  Moment,
  MomentCallouts,
  NightRecap,
  RecapMoment,
  RoomEvent,
  RoomState,
  SeenTableEvent,
} from "../src/index.js";
import { generatedHand } from "./moment-hands.js";
import { viewRoundTrips } from "./observers.js";
import { seededRandom } from "./random.js";
import { playSession, session } from "./sessions.js";

const CALLOUTS: readonly MomentCallouts[] = ["All", "SkipPainful", "Off"];

const nightSeed = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2_000_000_000, minimum: 1 }))
);

const FEW_NIGHTS = { arbitrary: { runs: 4 }, timeout: 120_000 };

const FOLDING_AUDIENCES = 4;

const ROOM_NIGHTS = { arbitrary: { runs: 24 }, timeout: 120_000 };

const PAINFUL_NIGHT_SEED = 100;

const PAINFUL_NIGHT_INTENTS = 400;

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

const allowedUnder = (callouts: MomentCallouts) => (moment: Moment) =>
  callouts === "All" || (callouts === "SkipPainful" && !isPainful(moment));

const recounted = (
  events: readonly RoomEvent[],
  callouts: MomentCallouts,
  seatsAt: (index: number) => ReadonlyMap<SeatIndex, PlayerId>
): NightRecap => {
  const hands = handsIn(events, seatsAt);

  const pots = hands.map((hand) => {
    const won = new Map<PlayerId, number>();
    let pot = 0;

    for (const event of hand.events) {
      if (Events.$is("PotAwarded")(event)) {
        pot += event.amount;

        for (const share of event.winners) {
          const player = hand.seats.get(share.seat);

          if (player !== undefined) {
            won.set(player, (won.get(player) ?? 0) + share.amount);
          }
        }
      }
    }

    return {
      hand: hand.hand,
      pot,
      takers: [...won]
        .toSorted(([, left], [, right]) => right - left)
        .map(([player]) => player),
    };
  });

  let biggest: (typeof pots)[number] | null = null;

  for (const next of pots) {
    if (next.pot > 0 && (biggest === null || next.pot > biggest.pot)) {
      biggest = next;
    }
  }

  const leads: RecapMoment[] = hands.flatMap((hand) => {
    const lead = momentsOf(hand.events).find(allowedUnder(callouts));
    const story = storyOf(hand.events);

    return lead === undefined || Option.isNone(story)
      ? []
      : [
          {
            boards: story.value.boards,
            hand: hand.hand,
            moment: lead,
            players: lead.seats.flatMap((seat) => {
              const player = hand.seats.get(seat);

              return player === undefined
                ? []
                : [{ player, seat, shown: story.value.shown[seat] ?? [] }];
            }),
          },
        ];
  });

  const [first] = hands;
  const last = hands.at(-1);

  return {
    biggestPot: Option.fromNullOr(biggest).pipe(
      Option.map(({ hand, pot, takers }) => ({
        hand,
        pot: ChipsSchema.make(pot),
        takers,
      }))
    ),
    hands: hands.length,
    moments: leads.toSorted(recapOrder).slice(0, RECAP_MOMENTS),
    span:
      first === undefined || last === undefined
        ? Option.none()
        : Option.some({
            from: millis(first.startedAt),
            to: millis(Option.getOrElse(last.endedAt, () => 0)),
          }),
  };
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
    "equals a direct recount of the night, under every moments setting",
    { seed: nightSeed },
    ({ seed }) => {
      const night = nightOf(seed);

      for (const callouts of CALLOUTS) {
        expect(foldedFor(night, Audiences.Spectator(), callouts)).toStrictEqual(
          recounted(night, callouts, fixedSeats)
        );
      }
    },
    FEW_NIGHTS
  );

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
    FEW_NIGHTS
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
    FEW_NIGHTS
  );

  it.prop(
    "leaves painful moments out when the host spares them, and every moment out when moments are off",
    { seed: nightSeed },
    ({ seed }) => {
      const tally = talliedFor(nightOf(seed), Audiences.Spectator());
      const spared = recapOf(tally, "SkipPainful");

      expect({
        off: recapOf(tally, "Off").moments,
        painful: spared.moments.filter(({ moment }) => isPainful(moment)),
      }).toStrictEqual({ off: [], painful: [] });
    },
    FEW_NIGHTS
  );
});

const calloutsAtClose = (
  log: readonly RoomEvent[],
  opening: MomentCallouts
) => {
  let callouts = opening;

  for (const event of log) {
    if (RoomEvents.$is("SettingsChanged")(event)) {
      callouts = event.settings.moments;
    }
  }

  return callouts;
};

const seatsOf = (state: RoomState): ReadonlyMap<SeatIndex, PlayerId> =>
  RoomStates.$match(state, {
    Closed: () => new Map(),
    Open: (open) =>
      new Map(
        SEATS.flatMap((seat) => {
          const occupant = open.table.seats[seat];

          return occupant !== undefined && Seats.$is("Occupied")(occupant)
            ? [[seat, occupant.player] as const]
            : [];
        })
      ),
  });

describe("the recap a room carries", () => {
  it.prop(
    "is the recount of the room's own log, and every audience's settled view carries the same one",
    { source: session },
    ({ source }) => {
      const seatings: ReadonlyMap<SeatIndex, PlayerId>[] = [];

      const played = playSession(
        source,
        (state) => {
          seatings.push(seatsOf(state));
        },
        (same) => same,
        "Folded"
      );

      const seatsAt = (index: number) => seatings[index] ?? new Map();

      const closedView = RoomStates.$match(played.state, {
        Closed: (closed) => Option.some(closed),
        Open: () => Option.none(),
      });

      const carried = RoomStates.$match(played.state, {
        Closed: (closed) => closed.recap,
        Open: (open) => recapOf(open.tally, open.settings.moments),
      });

      const callouts = RoomStates.$match(played.state, {
        Closed: () => calloutsAtClose(played.log, played.settings.moments),
        Open: (open) => open.settings.moments,
      });

      expect(carried).toStrictEqual(recounted(played.log, callouts, seatsAt));

      for (const closed of Option.toArray(closedView)) {
        const recaps = [
          Audiences.Spectator(),
          ...closed.members.map(({ player }) => Audiences.Unseated({ player })),
        ].map((audience) =>
          Option.some(viewFor(closed, audience, closed.now)).pipe(
            Option.filter(RoomViews.$is("Closed")),
            Option.map((view) => view.recap)
          )
        );

        expect(recaps).toStrictEqual(
          recaps.map(() => Option.some(closed.recap))
        );

        expect(
          [Audiences.Spectator()].map((audience) =>
            viewRoundTrips(viewFor(closed, audience, closed.now))
          )
        ).toStrictEqual([true]);
      }
    },
    ROOM_NIGHTS
  );
});

const closingOfPinnedNight = () => {
  const random = seededRandom(PAINFUL_NIGHT_SEED);

  const source = {
    intents: Array.from({ length: PAINFUL_NIGHT_INTENTS }, () => ({
      pick: random.below(1_000_000_000),
      roll: random.below(100),
      wait: random.below(100),
    })),
    setup: random.below(1_000_000_000),
  };

  let before: RoomState | undefined;

  let closing: Option.Option<{ event: RoomEvent; open: RoomState }> =
    Option.none();

  playSession(
    source,
    (state, event) => {
      if (RoomEvents.$is("RoomClosed")(event) && before !== undefined) {
        closing = Option.some({ event, open: before });
      }

      before = state;
    },
    (settings) => ({ ...settings, moments: "All" }),
    "Folded"
  );

  return closing;
};

const closedUnder = (callouts: MomentCallouts): readonly RecapMoment[] =>
  Option.match(closingOfPinnedNight(), {
    onNone: () => [],
    onSome: ({ event, open }) =>
      RoomStates.$match(
        evolve(
          RoomStates.$match(open, {
            Closed: (closed): RoomState => closed,
            Open: (state): RoomState => ({
              ...state,
              settings: { ...state.settings, moments: callouts },
            }),
          }),
          event
        ),
        {
          Closed: (closed) => closed.recap.moments,
          Open: (): readonly RecapMoment[] => [],
        }
      ),
  });

describe("a settled room's recap and the host's moments setting", () => {
  it("keeps every moment under All, spares the painful ones under SkipPainful, and keeps none when moments are off", () => {
    const [all = [], spared = [], off = []] = CALLOUTS.map(closedUnder);

    expect({
      allHasBoth:
        all.some(({ moment }) => isPainful(moment)) &&
        all.some(({ moment }) => !isPainful(moment)),
      off,
      sparedPainful: spared.filter(({ moment }) => isPainful(moment)),
      sparedSome: spared.length > 0,
    }).toStrictEqual({
      allHasBoth: true,
      off: [],
      sparedPainful: [],
      sparedSome: true,
    });
  });
});
