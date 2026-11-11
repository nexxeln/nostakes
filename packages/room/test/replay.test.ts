import { describe, expect, it } from "@effect/vitest";
import { Events, ShowdownEntries } from "@nostakes/engine";
import type { Card, Event } from "@nostakes/engine";
import { Match, Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  ReplaySteps,
  cardsRevealedBy,
  oddsAskedBy,
  replayOf,
  tableChances,
} from "../src/index.js";
import type { ReplayStep, SeenTableEvent } from "../src/index.js";
import {
  act,
  bets,
  calls,
  feedFor,
  folds,
  generatedHand,
  played,
  seatedAudiences,
  shows,
  spectatorFeed,
} from "./moment-hands.js";
import { seededRandom } from "./random.js";

const handSeed = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 2_000_000_000, minimum: 1 }))
);

const HANDS = { arbitrary: { runs: 60 }, timeout: 120_000 };

const headsUp = (button: string, other: string, board: string) => {
  const [buttonFirst = "", buttonSecond = ""] = button.split(" ");
  const [otherFirst = "", otherSecond = ""] = other.split(" ");

  return `${otherFirst} ${buttonFirst} ${otherSecond} ${buttonSecond} ${board}`;
};

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

const tooSoon = (
  steps: readonly ReplayStep[],
  spectator: readonly SeenTableEvent[]
) =>
  steps.flatMap((step) => {
    const seen = seenBy(spectator, step.at);

    return cardsRevealedBy(step)
      .filter((card) => !seen.has(card))
      .map((card) => ({ at: step.at, card, step: step._tag }));
  });

const replaysOf = (events: readonly Event[]) => ({
  players: seatedAudiences(events).map((audience) =>
    replayOf(feedFor(events, audience))
  ),
  spectator: replayOf(spectatorFeed(events)),
});

describe("a hand's replay", () => {
  it.prop(
    "shows no card before the table saw it, whoever's device tells it",
    { seed: handSeed },
    ({ seed }) => {
      const events = generatedHand(seededRandom(seed));
      const spectator = spectatorFeed(events);

      const early = seatedAudiences(events).flatMap((audience) =>
        Option.match(replayOf(feedFor(events, audience)), {
          onNone: () => [],
          onSome: (replay) => tooSoon(replay.steps, spectator),
        })
      );

      expect(early).toStrictEqual([]);
    },
    HANDS
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
    HANDS
  );

  it.prop(
    "tells every hand that ended, with its deal and at least one award",
    { seed: handSeed },
    ({ seed }) => {
      const events = generatedHand(seededRandom(seed));
      const replay = replayOf(spectatorFeed(events));

      expect(
        replay.pipe(
          Option.map(({ steps }) => ({
            awarded: steps.some((step) => ReplaySteps.$is("Awarded")(step)),
            dealt: steps.filter((step) => ReplaySteps.$is("Dealt")(step))
              .length,
            ordered: steps.every(
              (step, index) =>
                index === 0 || (steps[index - 1]?.at ?? 0) <= step.at
            ),
          }))
        )
      ).toStrictEqual(Option.some({ awarded: true, dealt: 1, ordered: true }));
    },
    HANDS
  );

  it.prop(
    "asks for the same odds it would compute itself, so a device can work them out elsewhere",
    { seed: handSeed },
    ({ seed }) => {
      const feed = spectatorFeed(generatedHand(seededRandom(seed)));
      const asked = oddsAskedBy(feed);

      expect(
        replayOf(feed, (question) =>
          Option.match(asked, {
            onNone: () => [],
            onSome: (known) =>
              JSON.stringify(known) === JSON.stringify(question)
                ? tableChances(known)
                : [],
          })
        )
      ).toStrictEqual(replayOf(feed));
    },
    HANDS
  );

  it("gives each tabled hand its chance from the board the money went in on", () => {
    const events = played({
      deck: headsUp("As Ah", "Kd Kc", "2s 7h 9d 3c 4s"),
      moves: [act(0, bets(1000)), act(1, calls)],
      stacks: { 0: 1000, 1: 1000 },
    });

    const odds = replayOf(spectatorFeed(events)).pipe(
      Option.map((replay) =>
        replay.steps.filter(ReplaySteps.$is("Odds")).map((step) => ({
          board: step.board.length,
          percents: step.chances.map((chance) => chance.percent),
        }))
      )
    );

    expect(odds).toStrictEqual(Option.some([{ board: 0, percents: [81, 19] }]));
  });

  it("keeps a folded hand face down and shows a card shown after the hand from then on", () => {
    const events = [
      ...played({
        deck: headsUp("7c 2d", "Ah Kh", "9s 9h 4d Jc 3s"),
        moves: [act(0, bets(300)), act(1, folds), shows(0, "7c")],
        stacks: { 0: 1000, 1: 1000 },
      }),
    ];

    const shown = replayOf(spectatorFeed(events)).pipe(
      Option.map((replay) =>
        replay.steps
          .filter(ReplaySteps.$is("Shown"))
          .map((step) => step.cards.length)
      )
    );

    expect(shown).toStrictEqual(Option.some([1]));
  });

  it("only reads the hand from its start", () => {
    const events = spectatorFeed(
      played({
        deck: headsUp("As Ah", "Kd Kc", "2s 7h 9d 3c 4s"),
        moves: [act(0, bets(1000)), act(1, calls)],
        stacks: { 0: 1000, 1: 1000 },
      })
    ).filter((event) => !Events.$is("HandStarted")(event));

    expect(replayOf(events)).toStrictEqual(Option.none());
  });
});
