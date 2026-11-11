import { describe, expect, it } from "@effect/vitest";
import {
  CardFromText,
  CardSchema,
  DECK_SIZE,
  Events,
  ShowdownEntries,
  evaluate,
} from "@nostakes/engine";
import type { Card, Event } from "@nostakes/engine";
import { Match, Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  ReplaySteps,
  cardsHeldBy,
  oddsAskedBy,
  replayOf,
  tableChances,
} from "../src/index.js";
import type { Replay, ReplayStep, SeenTableEvent } from "../src/index.js";
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

const COUNTED_HANDS = { arbitrary: { runs: 12 }, timeout: 120_000 };

const uncounted = () => [];

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

const boardOf = (step: ReplayStep): readonly Card[] =>
  ReplaySteps.$match(step, {
    Acted: () => [],
    Awarded: () => [],
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

const cardOf = Schema.decodeSync(CardFromText);

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
    HANDS
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
    HANDS
  );

  it.prop(
    "names as tabled from the start exactly the cards each seat showed by the end",
    { seed: handSeed },
    ({ seed }) => {
      const events = generatedHand(seededRandom(seed));

      const replay = replayOf(spectatorFeed(events), uncounted);

      expect(
        replay.pipe(
          Option.map(({ steps, tabled }) =>
            tabled.map(({ cards, seat }) => ({
              cards: [...cards].toSorted((one, other) => one - other),
              seat,
              shown: [
                ...(steps
                  .filter(ReplaySteps.$is("Shown"))
                  .findLast((step) => step.seat === seat)?.cards ?? []),
              ].toSorted((one, other) => one - other),
            }))
          ),
          Option.map((seats) =>
            seats.filter(
              (seat) =>
                JSON.stringify(seat.cards) !== JSON.stringify(seat.shown)
            )
          )
        )
      ).toStrictEqual(Option.some([]));
    },
    HANDS
  );

  it.prop(
    "counts as an out exactly each unseen card that would put the seat alone ahead",
    { seed: handSeed },
    ({ seed }) => {
      const replay = replayOf(
        spectatorFeed(generatedHand(seededRandom(seed))),
        uncounted
      );

      const wrong = Option.match(replay, {
        onNone: () => [],
        onSome: ({ steps }) =>
          steps.filter(ReplaySteps.$is("Odds")).flatMap((step) => {
            const seen = new Set([
              ...step.board,
              ...step.chances.flatMap((chance) => chance.cards),
            ]);

            const ahead = (card: Card, seat: number) => {
              const mine = step.chances.find((chance) => chance.seat === seat);

              const rank = evaluate([
                ...(mine?.cards ?? []),
                ...step.board,
                card,
              ]);

              return step.chances.every(
                (chance) =>
                  chance.seat === seat ||
                  evaluate([...chance.cards, ...step.board, card]) < rank
              );
            };

            return step.outs.flatMap((outs) => {
              const expected = Array.from({ length: DECK_SIZE }, (_, card) =>
                CardSchema.make(card)
              )
                .filter((card) => !seen.has(card))
                .filter((card) => ahead(card, outs.seat));

              return JSON.stringify(expected) === JSON.stringify(outs.cards) &&
                step.board.length >= 3 &&
                step.board.length <= 4
                ? []
                : [{ at: step.at, expected, outs }];
            });
          }),
      });

      expect(wrong).toStrictEqual([]);
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
      const replay = replayOf(spectatorFeed(events), uncounted);

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

      const answers = new Map(
        oddsAskedBy(feed).map((asked) => [
          JSON.stringify(asked),
          tableChances(asked),
        ])
      );

      expect(
        replayOf(
          feed,
          (question) => answers.get(JSON.stringify(question)) ?? []
        )
      ).toStrictEqual(replayOf(feed));
    },
    COUNTED_HANDS
  );

  it("gives each tabled hand its chance from the deal and again after every board card", () => {
    const events = played({
      deck: headsUp("As Ah", "Kd Kc", "2s 7h 9d 3c 4s"),
      moves: [act(0, bets(1000)), act(1, calls)],
      stacks: { 0: 1000, 1: 1000 },
    });

    const odds = replayOf(spectatorFeed(events)).pipe(
      Option.map((replay) =>
        replay.steps.filter(ReplaySteps.$is("Odds")).map((step) => ({
          board: step.board.length,
          outs: step.outs.map((outs) => outs.cards),
          percents: step.chances.map((chance) => chance.percent),
        }))
      )
    );

    const kings = [cardOf("Kh"), cardOf("Ks")].toSorted(
      (one, other) => one - other
    );

    expect(odds).toStrictEqual(
      Option.some([
        { board: 0, outs: [], percents: [81, 19] },
        { board: 1, outs: [], percents: [86, 14] },
        { board: 2, outs: [], percents: [89, 11] },
        { board: 3, outs: [kings], percents: [92, 8] },
        { board: 4, outs: [kings], percents: [95, 5] },
        { board: 5, outs: [], percents: [100, 0] },
      ])
    );
  });

  it("tables from the start what a seat showed, and keeps a folded hand out of the odds", () => {
    const events = played({
      deck: headsUp("7c 2d", "Ah Kh", "9s 9h 4d Jc 3s"),
      moves: [act(0, bets(300)), act(1, folds), shows(0, "7c")],
      stacks: { 0: 1000, 1: 1000 },
    });

    expect(
      replayOf(spectatorFeed(events)).pipe(
        Option.map((replay) => ({
          odds: replay.steps.filter(ReplaySteps.$is("Odds")).length,
          tabled: replay.tabled.map((tabled) => tabled.cards),
        }))
      )
    ).toStrictEqual(Option.some({ odds: 0, tabled: [[cardOf("7c")]] }));
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
