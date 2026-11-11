import { describe, expect, it } from "@effect/vitest";
import { ShowdownEntries } from "@nostakes/engine";
import type { Card, Event } from "@nostakes/engine";
import { Match, Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { ReplaySteps, cardsHeldBy, replayOf } from "../src/index.js";
import type { Replay, ReplayStep, SeenTableEvent } from "../src/index.js";
import {
  feedFor,
  generatedHand,
  seatedAudiences,
  spectatorFeed,
} from "./moment-hands.js";
import { seededRandom } from "./random.js";
import { generated } from "./scale.js";

const handSeed = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2_000_000_000, minimum: 1 }))
);

const uncounted = () => [];

const shownIn = (event: SeenTableEvent): readonly Card[] =>
  Match.value(event).pipe(
    Match.tags({
      CardsShown: ({ cards }) => cards,
      HandTabled: ({ cards }) => cards,
      HandsTabled: ({ hands }) => hands.flatMap((hand) => hand.cards),
      RabbitHunted: ({ cards }) => cards,
      ShowdownReached: ({ order }) =>
        order.flatMap((entry) =>
          ShowdownEntries.$is("Shown")(entry) ? entry.cards : []
        ),
      StreetDealt: ({ cards }) => cards,
    }),
    Match.orElse(() => [])
  );

const seenBy = (feed: readonly SeenTableEvent[], at: number) =>
  new Set(feed.slice(0, at + 1).flatMap(shownIn));

const boardOf = (step: ReplayStep): readonly Card[] =>
  ReplaySteps.$match(step, {
    Acted: () => [],
    Awarded: () => [],
    Bounty: () => [],
    Dealt: () => [],
    Gathered: () => [],
    Mucked: () => [],
    Odds: ({ board }) => board,
    Posted: () => [],
    Returned: () => [],
    Runs: () => [],
    Shown: () => [],
    StreetDealt: ({ cards }) => cards,
  });

const boardTooSoon = (
  steps: readonly ReplayStep[],
  spectator: readonly SeenTableEvent[]
) =>
  steps.flatMap((step) => {
    const seen = seenBy(spectator, step.at);

    return boardOf(step)
      .filter((card) => !seen.has(card))
      .map((card) => ({ at: step.at, card, step: step._tag }));
  });

const neverShown = (replay: Replay, spectator: readonly SeenTableEvent[]) => {
  const shown = seenBy(spectator, spectator.length);

  return cardsHeldBy(replay).filter((card) => !shown.has(card));
};

const everyDevice = (events: readonly Event[]) =>
  [
    spectatorFeed(events),
    ...seatedAudiences(events).map((audience) => feedFor(events, audience)),
  ].flatMap((feed) => Option.toArray(replayOf(feed, uncounted)));

const replaysOf = (events: readonly Event[]) => ({
  players: seatedAudiences(events).map((audience) =>
    replayOf(feedFor(events, audience), uncounted)
  ),
  spectator: replayOf(spectatorFeed(events), uncounted),
});

describe("a hand's replay", () => {
  it.prop(
    "holds no card the table was not shown by the end of the hand, whoever's device tells it",
    { seed: handSeed },
    ({ seed }) => {
      const events = generatedHand(seededRandom(seed));
      const spectator = spectatorFeed(events);

      expect(
        everyDevice(events).flatMap((replay) => neverShown(replay, spectator))
      ).toStrictEqual([]);
    },
    generated(25, 60)
  );

  it.prop(
    "deals no board card, and counts no odds on one, before the table saw it",
    { seed: handSeed },
    ({ seed }) => {
      const events = generatedHand(seededRandom(seed));
      const spectator = spectatorFeed(events);

      expect(
        everyDevice(events).flatMap((replay) =>
          boardTooSoon(replay.steps, spectator)
        )
      ).toStrictEqual([]);
    },
    generated(25, 60)
  );

  it.prop(
    "tells every audience the same hand, so a player's own hidden cards never reach it",
    { seed: handSeed },
    ({ seed }) => {
      const { players, spectator } = replaysOf(
        generatedHand(seededRandom(seed))
      );

      expect(players).toStrictEqual(players.map(() => spectator));
    },
    generated(25, 60)
  );
});
