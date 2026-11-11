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

import { poseAtKeys, replayPlan } from "../src/features/moments/replay-plan.js";
import type { ReplayPlan } from "../src/features/moments/replay-plan.js";
import { startingStacks } from "../src/features/moments/watch.js";
import type { SeatStack } from "../src/features/moments/watch.js";

const handSeed = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2_000_000_000, minimum: 1 }))
);

const HANDS = { arbitrary: { runs: 40 }, timeout: 120_000 };

const LONGEST_MS = 15_000;

const SHORTEST_MS = 8000;

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

const planFor = (feed: readonly SeenTableEvent[]) =>
  replayOf(feed).pipe(
    Option.map((replay) =>
      replayPlan(replay, {
        lead: replay.dealtIn[0] ?? replay.button,
        seats: replay.dealtIn.map((seat) => ({
          avatar: "",
          name: `Player ${seat}`,
          seat,
          stack: 1000,
        })),
      })
    )
  );

const earlyCards = (plan: ReplayPlan, spectator: readonly SeenTableEvent[]) =>
  plan.sprites.flatMap((sprite) => {
    if (sprite.art.kind !== "Card" || sprite.art.card.length === 0) {
      return [];
    }

    const { card } = sprite.art;

    const index = spectator.findIndex((event) =>
      revealedIn(event).some((shown) => cardText(shown) === card)
    );

    const allowed = Math.min(
      ...plan.timeline
        .filter((entry) => entry.at >= index)
        .map((entry) => entry.ms)
    );

    return index === -1 || sprite.shownAt < allowed
      ? [{ allowed, card, index, shownAt: sprite.shownAt }]
      : [];
  });

describe("a moment's hand replay", () => {
  it.prop(
    "starts every seat with the stack it had before the hand, read back from the stack after it",
    { seed: handSeed },
    ({ seed }) => {
      const { after, buyIns, events } = playedHand(seed);

      expect(
        startingStacks(feedFor(events, Audiences.Spectator()), after)
      ).toStrictEqual(buyIns);
    },
    HANDS
  );

  it.prop(
    "turns no card face up before the table saw it, on any device",
    { seed: handSeed },
    ({ seed }) => {
      const events = generatedHand(seed);
      const spectator = feedFor(events, Audiences.Spectator());

      const early = [Audiences.Spectator(), ...audiencesOf(events)].flatMap(
        (audience) =>
          Option.match(planFor(feedFor(events, audience)), {
            onNone: () => [],
            onSome: (plan) => earlyCards(plan, spectator),
          })
      );

      expect(early).toStrictEqual([]);
    },
    HANDS
  );

  it.prop(
    "plays any hand in 8 to 15 seconds and leaves the table empty for the moment card",
    { seed: handSeed },
    ({ seed }) => {
      const plan = planFor(feedFor(generatedHand(seed), Audiences.Spectator()));

      expect(
        plan.pipe(
          Option.map((found) => ({
            fits: found.length >= SHORTEST_MS && found.length <= LONGEST_MS,
            leftOnTable: found.sprites.filter(
              (sprite) => poseAtKeys(sprite.keys, found.length - 1).opacity > 0
            ).length,
          }))
        )
      ).toStrictEqual(Option.some({ fits: true, leftOnTable: 0 }));
    },
    HANDS
  );

  it.prop(
    "plans the same replay on every device",
    { seed: handSeed },
    ({ seed }) => {
      const events = generatedHand(seed);

      const spectator = JSON.stringify(
        planFor(feedFor(events, Audiences.Spectator()))
      );

      expect(
        audiencesOf(events).map((audience) =>
          JSON.stringify(planFor(feedFor(events, audience)))
        )
      ).toStrictEqual(audiencesOf(events).map(() => spectator));
    },
    HANDS
  );
});
