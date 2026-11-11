import { describe, expect, it } from "@effect/vitest";
import {
  Actions,
  Antes,
  ChipsSchema,
  Commands,
  DeckSchema,
  Events,
  PendingDecisions,
  PlayerIdSchema,
  RunCountSchema,
  SeatIndexSchema,
  Seats,
  ShowdownEntries,
  TableConfigSchema,
  TableStates,
  cardText,
  decide,
  evolve,
  initialTable,
  pendingDecisions,
} from "@nostakes/engine";
import type { Command, Event, TableState } from "@nostakes/engine";
import {
  Audiences,
  RoomEvents,
  SeenEvents,
  millis,
  redact,
  replayOf,
} from "@nostakes/room";
import type { Audience, SeenTableEvent } from "@nostakes/room";
import { Match, Option, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { replayPlan } from "../src/features/moments/replay-plan.js";
import type { ReplayPlan } from "../src/features/moments/replay-plan.js";
import type { SeatStack } from "../src/features/moments/watch.js";

const handSeed = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2_000_000_000, minimum: 1 }))
);

const HANDS = { arbitrary: { runs: 150 }, timeout: 120_000 };

const chipCount = (amount: number) => ChipsSchema.make(amount);

const randomFrom = (seed: number) => {
  let state = seed % 2_147_483_647;

  return (below: number) => {
    state = (state * 48_271) % 2_147_483_647;

    return state % Math.max(1, below);
  };
};

const applied = (state: TableState, command: Command) => {
  const decision = decide(state, command);

  if (Result.isFailure(decision)) {
    throw new Error(`${command._tag} was refused: ${decision.failure._tag}`);
  }

  let next = state;

  for (const event of decision.success) {
    next = evolve(next, event);
  }

  return { events: decision.success, state: next };
};

const shuffled = (below: (count: number) => number) => {
  const cards = Array.from({ length: 52 }, (_, index) => index);

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const other = below(index + 1);
    const held = cards[index] ?? 0;

    cards[index] = cards[other] ?? 0;
    cards[other] = held;
  }

  return Schema.decodeSync(DeckSchema)(cards);
};

const nextMove = (
  state: TableState,
  below: (count: number) => number
): Command =>
  PendingDecisions.$match(pendingDecisions(state), {
    Bet: ({ legal }) => {
      const roll = below(100);

      if (roll < 15) {
        return Commands.Act({
          action: legal.canCheck ? Actions.Check() : Actions.Fold(),
          seat: legal.seat,
        });
      }

      const calm = legal.canCheck ? Actions.Check() : Actions.Call();

      return Option.match(legal.raise, {
        onNone: () => Commands.Act({ action: calm, seat: legal.seat }),
        onSome: ({ maxTo, minTo }) =>
          Commands.Act({
            action:
              roll < 60
                ? calm
                : Actions.RaiseTo({
                    to: chipCount(
                      roll < 85
                        ? Math.min(maxTo, minTo + below(Math.max(1, minTo * 2)))
                        : maxTo
                    ),
                  }),
            seat: legal.seat,
          }),
      });
    },
    ChooseRuns: ({ maxRuns, seats }) =>
      Commands.ChooseRuns({
        runs: RunCountSchema.make(1 + below(maxRuns)),
        seat: seats[0] ?? SeatIndexSchema.make(0),
      }),
    Nothing: () => Commands.StartHand({ deck: shuffled(below), straddles: [] }),
    Show: ({ choices }) =>
      choices.canMuck && below(3) === 0
        ? Commands.MuckHand({ seat: choices.seat })
        : Commands.TableHand({ seat: choices.seat }),
  });

const playedHand = (seed: number) => {
  const below = randomFrom(seed);
  const players = 2 + below(8);

  let state = initialTable(
    TableConfigSchema.make({
      allInHands: below(3) === 0 ? "Hidden" : "FaceUp",
      ante:
        below(4) === 0
          ? Antes.EveryPlayer({ amount: chipCount(1 + below(5)) })
          : Antes.NoAnte(),
      bigBlind: chipCount(10),
      maxRuns: RunCountSchema.make(1 + below(3)),
      rabbitHunt: false,
      showdown: below(3) === 0 ? "Interactive" : "Automatic",
      smallBlind: chipCount(5),
      straddle: { button: false, underTheGun: 0 },
    })
  );

  const buyIns: SeatStack[] = [];

  for (let index = 0; index < players; index += 1) {
    const buyIn = 50 + below(1500);

    buyIns.push({ seat: SeatIndexSchema.make(index), stack: buyIn });
    ({ state } = applied(
      state,
      Commands.SitDown({
        buyIn: chipCount(buyIn),
        player: PlayerIdSchema.make(`p${index}`),
        seat: SeatIndexSchema.make(index),
      })
    ));
  }

  const events: Event[] = [];

  do {
    const step = applied(state, nextMove(state, below));

    events.push(...step.events);
    ({ state } = step);
  } while (TableStates.$is("InHand")(state));

  const after = state.seats.flatMap((occupant, index) =>
    Seats.$is("Occupied")(occupant)
      ? [{ seat: SeatIndexSchema.make(index), stack: occupant.stack }]
      : []
  );

  return { after, buyIns, events };
};

const generatedHand = (seed: number): readonly Event[] =>
  playedHand(seed).events;

const feedFor = (
  events: readonly Event[],
  audience: Audience
): readonly SeenTableEvent[] =>
  events.flatMap((event) => {
    const seen = redact(RoomEvents.Table({ at: millis(0), event }), audience);

    return SeenEvents.$is("Table")(seen) ? [seen.event] : [];
  });

const audiencesOf = (events: readonly Event[]) =>
  events.flatMap((event) =>
    Events.$is("HoleCardsDealt")(event)
      ? [
          Audiences.Seated({
            player: PlayerIdSchema.make(`p${event.seat}`),
            seat: event.seat,
          }),
        ]
      : []
  );

const revealedIn = (event: SeenTableEvent) =>
  Match.value(event).pipe(
    Match.tags({
      CardsShown: ({ cards }) => cards,
      HandTabled: ({ cards }) => cards,
      HandsTabled: ({ hands }) => hands.flatMap((hand) => hand.cards),
      ShowdownReached: ({ order }) =>
        order.flatMap((entry) =>
          ShowdownEntries.$is("Shown")(entry) ? entry.cards : []
        ),
      StreetDealt: ({ cards }) => cards,
    }),
    Match.orElse(() => [])
  );

const evenChances = ({
  holes,
}: {
  readonly holes: readonly unknown[];
}): readonly number[] =>
  holes.map((_, index) => (index === 0 ? 100 - (holes.length - 1) * 11 : 11));

const KINDS = ["BadBeat", "Bluff", "HeroCall", "BigHand", "SplitRuns"] as const;

const planFor = (feed: readonly SeenTableEvent[], seed: number) =>
  replayOf(feed, evenChances).pipe(
    Option.map((replay) =>
      replayPlan(replay, {
        frame: seed % 2 === 0 ? "Story" : "Chat",
        kind: KINDS[seed % KINDS.length] ?? "BigHand",
        principals: replay.dealtIn.slice(0, 2),
        seats: replay.dealtIn.map((seat) => ({
          avatar: "",
          name: `Player ${seat}`,
          seat,
          stack: 1000,
        })),
        tier: 2,
      })
    )
  );

const faceUp = (plan: ReplayPlan) =>
  plan.sprites.flatMap((sprite) =>
    sprite.art.kind === "Card" && sprite.art.card.length > 0
      ? [{ card: sprite.art.card, shownAt: sprite.shownAt }]
      : []
  );

const neverShown = (plan: ReplayPlan, spectator: readonly SeenTableEvent[]) => {
  const shown = new Set(
    spectator.flatMap(revealedIn).map((card) => cardText(card))
  );

  return faceUp(plan).filter(({ card }) => !shown.has(card));
};

const boardTooSoon = (plan: ReplayPlan, spectator: readonly SeenTableEvent[]) =>
  faceUp(plan).flatMap(({ card, shownAt }) => {
    const index = spectator.findIndex(
      (event) =>
        Events.$is("StreetDealt")(event) &&
        event.cards.some((dealt) => cardText(dealt) === card)
    );

    const allowed = Math.min(
      ...plan.timeline
        .filter((entry) => entry.at >= index)
        .map((entry) => entry.ms)
    );

    return index === -1 || shownAt >= allowed
      ? []
      : [{ allowed, card, index, shownAt }];
  });

const everyDevice = (events: readonly Event[]) => [
  Audiences.Spectator(),
  ...audiencesOf(events),
];

const written = (plan: ReplayPlan) =>
  plan.sprites.flatMap((sprite) => {
    if (sprite.art.kind === "Pill") {
      return [{ at: sprite.shownAt, text: sprite.art.text }];
    }

    return sprite.art.kind === "Caption"
      ? [{ at: sprite.shownAt, text: sprite.art.lines.join(" ") }]
      : [];
  });

const plain = (text: string) => text.replaceAll(/[\u2066-\u2069]/gu, "");

const CLOCK_WORDS = /time bank|whole clock/u;

const REACTION = /\p{Extended_Pictographic}/u;

const saidOf = (plan: ReplayPlan) =>
  written(plan).map(({ text }) => plain(text));

describe("what the device kept of a hand, in its replay", () => {
  it.prop(
    "never mentions a clock or shows a reaction the device did not keep",
    { seed: handSeed },
    ({ seed }) => {
      const plan = planFor(
        feedFor(generatedHand(seed), Audiences.Spectator()),
        seed
      );

      expect(
        plan.pipe(
          Option.map((found) =>
            saidOf(found).filter(
              (text) => CLOCK_WORDS.test(text) || REACTION.test(text)
            )
          )
        )
      ).toStrictEqual(Option.some([]));
    },
    HANDS
  );
});

describe("a moment's hand replay", () => {
  it.prop(
    "turns face up, at any time, no card the table was not shown by the end of the hand, on any device",
    { seed: handSeed },
    ({ seed }) => {
      const events = generatedHand(seed);
      const spectator = feedFor(events, Audiences.Spectator());

      expect(
        everyDevice(events).flatMap((audience) =>
          Option.match(planFor(feedFor(events, audience), seed), {
            onNone: () => [],
            onSome: (plan) => neverShown(plan, spectator),
          })
        )
      ).toStrictEqual([]);
    },
    HANDS
  );

  it.prop(
    "shows no board card before the beat that deals its street",
    { seed: handSeed },
    ({ seed }) => {
      const spectator = feedFor(generatedHand(seed), Audiences.Spectator());

      expect(
        Option.match(planFor(spectator, seed), {
          onNone: () => [],
          onSome: (plan) => boardTooSoon(plan, spectator),
        })
      ).toStrictEqual([]);
    },
    HANDS
  );

  it.prop(
    "plans the same replay on every device",
    { seed: handSeed },
    ({ seed }) => {
      const events = generatedHand(seed);

      const spectator = JSON.stringify(
        planFor(feedFor(events, Audiences.Spectator()), seed)
      );

      expect(
        audiencesOf(events).map((audience) =>
          JSON.stringify(planFor(feedFor(events, audience), seed))
        )
      ).toStrictEqual(audiencesOf(events).map(() => spectator));
    },
    HANDS
  );
});
